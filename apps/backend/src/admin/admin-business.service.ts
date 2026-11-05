import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminBusinessService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notify: NotificationsService) {}

  list(q: { status?: string; search?: string; flagged?: string }) {
    return this.prisma.business.findMany({
      where: {
        ...(q.status ? { status: { in: q.status.split(',') as never } } : {}),
        ...(q.flagged === 'true' ? { flaggedForReview: true } : {}),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { email: { contains: q.search, mode: 'insensitive' } }, { gstin: q.search.toUpperCase() }] } : {}),
      },
      select: { id: true, name: true, ownerName: true, phone: true, email: true, type: true, category: true, status: true, statusReason: true, flaggedForReview: true, walletBalance: true, walletHeld: true, apiEnabled: true, createdAt: true, city: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async detail(id: string) {
    const b = await this.prisma.business.findUnique({
      where: { id },
      include: { addresses: true, documents: { orderBy: { createdAt: 'desc' } }, users: { select: { id: true, name: true, phone: true, email: true, role: true, active: true } }, apiKeys: { select: { id: true, keyId: true, mode: true, active: true, createdAt: true, lastUsedAt: true } }, city: true },
    });
    if (!b) throw Errors.notFound('Business');
    const [byStatus, duplicates] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { businessId: id }, _count: true }),
      this.prisma.business.findMany({
        where: { id: { not: id }, OR: [{ phone: b.phone }, ...(b.gstin ? [{ gstin: b.gstin }] : []), ...(b.pan ? [{ pan: b.pan }] : [])] },
        select: { id: true, name: true, status: true },
      }),
    ]);
    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count]));
    const closed = (counts.DELIVERED ?? 0) + (counts.RETURNED ?? 0);
    const { webhookSecret, ...rest } = b;
    return {
      ...rest,
      orderCounts: counts,
      undeliveredRate: closed ? (counts.RETURNED ?? 0) / closed : 0,
      duplicates,
      legitChecklist: [
        'Real person: phone and Aadhaar/PAN match the owner',
        'Real pickup point: address can be found on a map, shop board photo',
        'Real selling presence: website, Instagram, Google listing or shop',
        'Plausible product for a bike (not furniture, vehicles, prohibited items)',
        'Not a duplicate of a rejected business (phone, GSTIN, PAN, address)',
      ],
    };
  }

  async review(id: string, action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REACTIVATE', reason: string | undefined, adminId: string) {
    const b = await this.prisma.business.findUnique({ where: { id } });
    if (!b) throw Errors.notFound('Business');
    if (action !== 'APPROVE' && action !== 'REACTIVATE' && !reason?.trim()) throw new AppError('REASON_REQUIRED', 'A reason is required', 422);
    let data: Record<string, unknown>;
    switch (action) {
      case 'APPROVE':
        if (!['PENDING', 'REJECTED'].includes(b.status)) throw new AppError('NOT_REVIEWABLE', `Cannot approve a ${b.status} business`, 409);
        data = { status: 'APPROVED', statusReason: null, verifiedAt: new Date(), verifiedByAdminId: adminId, flaggedForReview: false };
        break;
      case 'REJECT': {
        if (b.status !== 'PENDING') throw new AppError('NOT_REVIEWABLE', `Cannot reject a ${b.status} business`, 409);
        const n = b.rejectionCount + 1;
        data = { status: 'REJECTED', statusReason: n >= 2 ? `${reason} (second rejection: manual call required before re-applying)` : reason, rejectionCount: n };
        break;
      }
      case 'SUSPEND':
        // Blocks new orders immediately; live orders continue; wallet visible but frozen.
        if (b.status !== 'APPROVED') throw new AppError('NOT_SUSPENDABLE', 'Only approved businesses can be suspended', 409);
        data = { status: 'SUSPENDED', statusReason: reason, apiEnabled: false };
        break;
      case 'REACTIVATE':
        if (b.status !== 'SUSPENDED') throw new AppError('NOT_SUSPENDED', 'Business is not suspended', 409);
        data = { status: 'APPROVED', statusReason: null };
        break;
    }
    const updated = await this.prisma.business.update({ where: { id }, data });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: `BUSINESS_${action}`, entity: 'Business', entityId: id, oldValue: { status: b.status }, newValue: { status: updated.status }, reason });
    const msg = {
      APPROVE: `${b.name} is verified on Quick Delivery. Recharge your wallet and create your first order.`,
      REJECT: `Your Quick Delivery verification was not approved: ${reason}. You can re-apply with corrected documents.`,
      SUSPEND: `Your Quick Delivery account is suspended: ${reason}. Contact support.`,
      REACTIVATE: `Your Quick Delivery account is active again.`,
    }[action];
    await this.notify.send({ channel: 'SMS', to: b.phone, template: `BUSINESS_${action}`, body: msg });
    return updated;
  }

  async setApi(id: string, input: { enabled: boolean; rateLimitPerMin?: number; rateLimitPerDay?: number }, adminId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id } });
    if (input.enabled && b.status !== 'APPROVED') throw Errors.businessNotVerified();
    const updated = await this.prisma.business.update({
      where: { id },
      data: { apiEnabled: input.enabled, ...(input.rateLimitPerMin ? { rateLimitPerMin: input.rateLimitPerMin } : {}), ...(input.rateLimitPerDay ? { rateLimitPerDay: input.rateLimitPerDay } : {}) },
    });
    if (!input.enabled) await this.prisma.apiKey.updateMany({ where: { businessId: id, active: true }, data: { active: false, revokedAt: new Date() } });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: input.enabled ? 'API_ENABLE' : 'API_DISABLE', entity: 'Business', entityId: id, newValue: input });
    return { apiEnabled: updated.apiEnabled, rateLimitPerMin: updated.rateLimitPerMin, rateLimitPerDay: updated.rateLimitPerDay };
  }
}
