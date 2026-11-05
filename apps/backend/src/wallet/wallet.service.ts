import { Injectable } from '@nestjs/common';
import { LedgerType } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { AppError, Errors } from '../common/errors';
import { rupees } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';

/**
 * Wallet ledger — "money must never be wrong" (masterplan §7).
 *
 * - Append-only ledger. Corrections are new entries with a reason.
 * - Every mutation runs inside a transaction holding a row lock on the business,
 *   and carries an idempotency key, so retries and double-clicks never double charge.
 * - available = walletBalance - walletHeld.
 */
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async lock(tx: Tx, businessId: string) {
    const rows = await tx.$queryRaw<{ walletBalance: number; walletHeld: number }[]>`
      SELECT "walletBalance", "walletHeld" FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    if (!rows.length) throw Errors.notFound('Business');
    return rows[0];
  }

  private async existing(tx: Tx, key: string) {
    return tx.walletLedger.findUnique({ where: { idempotencyKey: key } });
  }

  private async write(
    tx: Tx,
    args: {
      businessId: string;
      type: LedgerType;
      amount: number;
      balanceDelta: number;
      heldDelta: number;
      reason: string;
      key: string;
      orderId?: string;
      rechargeId?: string;
      createdByType?: string;
      createdById?: string;
      requireAvailable?: number;
    },
  ) {
    const dup = await this.existing(tx, args.key);
    if (dup) return { entry: dup, duplicate: true };
    const cur = await this.lock(tx, args.businessId);
    if (args.requireAvailable !== undefined) {
      const available = cur.walletBalance - cur.walletHeld;
      if (available < args.requireAvailable) throw Errors.insufficientWallet(args.requireAvailable, available);
    }
    const balance = cur.walletBalance + args.balanceDelta;
    const held = cur.walletHeld + args.heldDelta;
    if (held < 0) throw new AppError('WALLET_INVARIANT', 'Held amount cannot go below zero', 500);
    await tx.business.update({ where: { id: args.businessId }, data: { walletBalance: balance, walletHeld: held } });
    const entry = await tx.walletLedger.create({
      data: {
        businessId: args.businessId,
        orderId: args.orderId,
        rechargeId: args.rechargeId,
        type: args.type,
        amount: args.amount,
        balanceAfter: balance,
        heldAfter: held,
        reason: args.reason,
        createdByType: args.createdByType ?? 'SYSTEM',
        createdById: args.createdById,
        idempotencyKey: args.key,
      },
    });
    return { entry, duplicate: false };
  }

  async summary(businessId: string) {
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, select: { walletBalance: true, walletHeld: true, cityId: true } });
    if (!b) throw Errors.notFound('Business');
    const pricing = await this.prisma.pricingConfig.findFirst({
      where: { cityId: b.cityId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    const available = b.walletBalance - b.walletHeld;
    return {
      balance: b.walletBalance,
      held: b.walletHeld,
      available,
      lowBalance: pricing ? available < pricing.lowBalanceWarnAt : false,
      canCreateOrder: pricing ? available >= pricing.deliveryFee : false,
      deliveryFee: pricing?.deliveryFee ?? null,
      returnFee: pricing?.returnFee ?? null,
      minRecharge: pricing?.minRechargeAmount ?? null,
      maxRecharge: pricing?.maxRechargeAmount ?? null,
    };
  }

  passbook(businessId: string, opts: { take?: number; cursor?: string } = {}) {
    return this.prisma.walletLedger.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.take ?? 50, 500),
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { order: { select: { code: true } } },
    });
  }

  /** Gateway-confirmed recharge. Idempotent per recharge id. */
  creditRecharge(tx: Tx, businessId: string, rechargeId: string, amount: number) {
    return this.write(tx, {
      businessId, type: 'RECHARGE', amount, balanceDelta: amount, heldDelta: 0,
      reason: `Wallet recharge ${rupees(amount)}`, key: `recharge:${rechargeId}`, rechargeId, createdByType: 'GATEWAY',
    });
  }

  /** Hold the forward fee when a rider accepts (assumption A1). Fails if available < fee. */
  hold(tx: Tx, businessId: string, orderId: string, orderCode: string, amount: number, offerId: string) {
    return this.write(tx, {
      businessId, orderId, type: 'HOLD', amount, balanceDelta: 0, heldDelta: amount,
      reason: `Hold for order ${orderCode} (rider assigned)`, key: `hold:${orderId}:${offerId}`, requireAvailable: amount,
    });
  }

  /** Release an active hold (cancel after assignment, before pickup / rider unassigned). */
  async release(tx: Tx, businessId: string, orderId: string, orderCode: string, reason: string) {
    const holds = await tx.walletLedger.findMany({ where: { orderId, type: { in: ['HOLD', 'RELEASE', 'FORWARD_CHARGE'] } } });
    const active = this.activeHold(holds);
    if (active <= 0) return null;
    return this.write(tx, {
      businessId, orderId, type: 'RELEASE', amount: active, balanceDelta: 0, heldDelta: -active,
      reason: `Hold released for ${orderCode}: ${reason}`, key: `release:${orderId}:${holds.length}`,
    });
  }

  /** Convert the hold into the forward charge at pickup. */
  async chargeForward(tx: Tx, businessId: string, orderId: string, orderCode: string, fee: number) {
    const holds = await tx.walletLedger.findMany({ where: { orderId, type: { in: ['HOLD', 'RELEASE', 'FORWARD_CHARGE'] } } });
    const active = this.activeHold(holds);
    // Normal path: active hold equals fee. Defensive path: if no hold exists, charge directly.
    return this.write(tx, {
      businessId, orderId, type: 'FORWARD_CHARGE', amount: fee, balanceDelta: -fee, heldDelta: -Math.min(active, fee),
      reason: `Forward delivery charge for ${orderCode}`, key: `forward:${orderId}`,
    });
  }

  /** Return-leg charge when the rider marks Undelivered. May take balance below zero; new orders are then blocked until recharge. */
  chargeReturn(tx: Tx, businessId: string, orderId: string, orderCode: string, fee: number, reason: string) {
    return this.write(tx, {
      businessId, orderId, type: 'RETURN_CHARGE', amount: fee, balanceDelta: -fee, heldDelta: 0,
      reason: `Return charge for ${orderCode} (${reason})`, key: `return:${orderId}`,
    });
  }

  private activeHold(entries: { type: LedgerType; amount: number }[]) {
    let held = 0;
    for (const e of entries) {
      if (e.type === 'HOLD') held += e.amount;
      if (e.type === 'RELEASE') held -= e.amount;
      if (e.type === 'FORWARD_CHARGE') held -= Math.min(held, e.amount);
    }
    return held;
  }

  /** Support/admin manual adjustment. Always with a reason; always audited. */
  async adjust(businessId: string, kind: 'CREDIT' | 'DEBIT_ADJUSTMENT' | 'REFUND', amount: number, reason: string, adminId: string, orderId?: string) {
    if (!reason?.trim()) throw new AppError('REASON_REQUIRED', 'A reason is required for wallet adjustments', 422);
    if (!Number.isInteger(amount) || amount <= 0) throw new AppError('INVALID_AMOUNT', 'Amount must be a positive number of paise', 422);
    return this.prisma.$transaction(async (tx) => {
      const delta = kind === 'DEBIT_ADJUSTMENT' ? -amount : amount;
      const res = await this.write(tx, {
        businessId, orderId, type: kind, amount, balanceDelta: delta, heldDelta: 0,
        reason, key: `adjust:${businessId}:${Date.now()}:${Math.random()}`, createdByType: 'ADMIN', createdById: adminId,
      });
      await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: `WALLET_${kind}`, entity: 'Business', entityId: businessId, newValue: { amount, orderId }, reason }, tx);
      return res.entry;
    });
  }
}
