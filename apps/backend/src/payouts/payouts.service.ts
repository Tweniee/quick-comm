import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { decrypt } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

/** Monday 00:00 (server time) of the week containing `d`. */
export function weekStartOf(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * Weekly driver payouts (assumption A2). Earnings accrue per completed leg; a weekly statement bundles them.
 * Paying out is a separate step (bank transfer via gateway payouts or manual NEFT), recorded here with a reference.
 */
@Injectable()
export class PayoutsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async generate(weekStartIso: string | undefined, adminId: string) {
    const weekStart = weekStartOf(weekStartIso ? new Date(weekStartIso) : new Date(Date.now() - 7 * 86_400_000));
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    if (weekEnd > new Date()) throw new AppError('WEEK_NOT_OVER', 'Payouts can be generated only for a completed week', 409);
    const rows = await this.prisma.driverEarning.groupBy({ by: ['driverId'], where: { payoutId: null, createdAt: { gte: weekStart, lt: weekEnd } }, _sum: { amount: true } });
    const created = [];
    for (const r of rows) {
      const p = await this.prisma.$transaction(async (tx) => {
        const driver = await tx.driver.findUniqueOrThrow({ where: { id: r.driverId } });
        const earnings = await tx.driverEarning.findMany({ where: { driverId: r.driverId, payoutId: null, createdAt: { gte: weekStart, lt: weekEnd } } });
        const gross = earnings.reduce((s, e) => s + e.amount, 0);
        const payout = await tx.driverPayout.upsert({
          where: { driverId_weekStart: { driverId: r.driverId, weekStart } },
          create: {
            driverId: r.driverId, weekStart, weekEnd,
            deliveryCount: earnings.filter((e) => e.leg === 'DELIVERY').length,
            returnCount: earnings.filter((e) => e.leg === 'RETURN').length,
            grossPay: gross, netPay: gross,
            status: ['SUSPENDED', 'BLOCKED'].includes(driver.status) ? 'HELD' : 'PENDING',
          },
          update: {},
        });
        await tx.driverEarning.updateMany({ where: { id: { in: earnings.map((e) => e.id) } }, data: { payoutId: payout.id } });
        return payout;
      });
      created.push(p);
    }
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'PAYOUTS_GENERATE', entity: 'DriverPayout', entityId: weekStart.toISOString(), newValue: { count: created.length } });
    return { weekStart, weekEnd, payouts: created.length };
  }

  list(q: { status?: string; weekStart?: string }) {
    return this.prisma.driverPayout.findMany({
      where: { ...(q.status ? { status: q.status as never } : {}), ...(q.weekStart ? { weekStart: weekStartOf(new Date(q.weekStart)) } : {}) },
      include: { driver: { select: { name: true, phone: true, bankAccountLast4: true, ifsc: true, accountHolderName: true } } },
      orderBy: [{ weekStart: 'desc' }, { netPay: 'desc' }],
      take: 500,
    });
  }

  async setStatus(id: string, status: 'PAID' | 'FAILED' | 'HELD' | 'PENDING', reference: string | undefined, adminId: string) {
    const p = await this.prisma.driverPayout.findUnique({ where: { id }, include: { driver: true } });
    if (!p) throw Errors.notFound('Payout');
    if (p.status === 'PAID') throw new AppError('ALREADY_PAID', 'This payout is already marked paid', 409);
    if (status === 'PAID' && ['SUSPENDED', 'BLOCKED'].includes(p.driver.status)) throw new AppError('DRIVER_HELD', 'Payout is held while the driver is suspended or blocked', 409);
    if (status === 'PAID' && !reference) throw new AppError('REFERENCE_REQUIRED', 'Enter the bank transfer reference (UTR)', 422);
    const updated = await this.prisma.driverPayout.update({ where: { id }, data: { status, reference, paidAt: status === 'PAID' ? new Date() : null } });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: `PAYOUT_${status}`, entity: 'DriverPayout', entityId: id, oldValue: { status: p.status }, newValue: { status, reference } });
    return updated;
  }

  /** Bank transfer file for finance. Full account numbers appear only here, and the export is audited. */
  async exportCsv(weekStartIso: string, adminId: string) {
    const weekStart = weekStartOf(new Date(weekStartIso));
    const rows = await this.prisma.driverPayout.findMany({ where: { weekStart, status: 'PENDING' }, include: { driver: true } });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'PAYOUT_EXPORT', entity: 'DriverPayout', entityId: weekStart.toISOString(), newValue: { rows: rows.length } });
    const lines = ['payout_id,driver_name,phone,account_holder,account_number,ifsc,amount_rupees,deliveries,returns'];
    for (const r of rows) {
      const acct = r.driver.bankAccountEnc ? decrypt(r.driver.bankAccountEnc) : '';
      lines.push([r.id, r.driver.name, r.driver.phone, r.driver.accountHolderName ?? '', acct, r.driver.ifsc ?? '', (r.netPay / 100).toFixed(2), r.deliveryCount, r.returnCount].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }
}
