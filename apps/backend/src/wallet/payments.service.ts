import { Injectable, Logger } from '@nestjs/common';
import { config } from '../common/config';
import { hmacSha256, safeEqual } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { CitiesService } from '../cities/cities.service';
import { WalletService } from './wallet.service';

/**
 * Wallet recharge via a payment gateway. Providers:
 *  - mock: dev/test only, confirm with POST /business/wallet/recharges/:id/mock-pay
 *  - razorpay: creates a Razorpay order; credit happens only on a signature-verified webhook.
 */
@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');
  constructor(private prisma: PrismaService, private wallet: WalletService, private cities: CitiesService) {}

  async createRecharge(businessId: string, amount: number) {
    const b = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!b) throw Errors.notFound('Business');
    if (b.status !== 'APPROVED') {
      throw new AppError('RECHARGE_BLOCKED', 'Wallet recharge opens after your business is verified', 403, 'COMPLETE_VERIFICATION');
    }
    const p = await this.cities.activePricing(b.cityId);
    if (amount < p.minRechargeAmount) throw new AppError('RECHARGE_TOO_SMALL', `Minimum recharge is ₹${p.minRechargeAmount / 100}`, 422);
    if (amount > p.maxRechargeAmount) throw new AppError('RECHARGE_TOO_LARGE', `Maximum recharge is ₹${p.maxRechargeAmount / 100}`, 422);

    const provider = config.paymentProvider;
    const recharge = await this.prisma.recharge.create({ data: { businessId, amount, provider: provider.toUpperCase() } });
    if (provider === 'razorpay') {
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: 'INR', receipt: recharge.id, notes: { businessId, rechargeId: recharge.id } }),
      });
      if (!res.ok) throw new AppError('GATEWAY_ERROR', 'Payment gateway is unavailable, please retry', 502, 'RETRY');
      const order = (await res.json()) as { id: string };
      await this.prisma.recharge.update({ where: { id: recharge.id }, data: { providerRef: order.id } });
      return { rechargeId: recharge.id, provider: 'razorpay', razorpayOrderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount };
    }
    return { rechargeId: recharge.id, provider: 'mock', amount };
  }

  async markPaid(rechargeId: string, providerRef?: string) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.recharge.findUnique({ where: { id: rechargeId } });
      if (!r) throw Errors.notFound('Recharge');
      if (r.status === 'PAID') return r;
      await this.wallet.creditRecharge(tx, r.businessId, r.id, r.amount);
      return tx.recharge.update({ where: { id: r.id }, data: { status: 'PAID', paidAt: new Date(), providerRef: providerRef ?? r.providerRef } });
    });
  }

  async mockPay(businessId: string, rechargeId: string) {
    if (process.env.NODE_ENV === 'production' || config.paymentProvider !== 'mock') throw Errors.forbidden('Mock payments are disabled');
    const r = await this.prisma.recharge.findUnique({ where: { id: rechargeId } });
    if (!r || r.businessId !== businessId) throw Errors.notFound('Recharge');
    return this.markPaid(rechargeId, `mock_${rechargeId}`);
  }

  /** Razorpay webhook. A fake webhook must never credit a wallet: signature is verified on the raw body. */
  async razorpayWebhook(rawBody: string, signature: string | undefined) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature || !safeEqual(hmacSha256(secret, rawBody), signature)) {
      throw new AppError('INVALID_SIGNATURE', 'Invalid webhook signature', 401);
    }
    const evt = JSON.parse(rawBody);
    if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
      const payment = evt.payload?.payment?.entity;
      const orderId: string | undefined = payment?.order_id ?? evt.payload?.order?.entity?.id;
      const r = orderId ? await this.prisma.recharge.findUnique({ where: { providerRef: orderId } }) : null;
      if (!r) { this.log.warn(`Webhook for unknown order ${orderId}`); return { ok: true }; }
      if (payment?.amount !== undefined && payment.amount !== r.amount) {
        this.log.error(`Amount mismatch for recharge ${r.id}`);
        return { ok: false };
      }
      await this.markPaid(r.id, orderId);
    }
    return { ok: true };
  }
}
