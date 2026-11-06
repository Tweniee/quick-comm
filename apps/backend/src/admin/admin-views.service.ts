import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { maskPhone } from '../common/crypto';
import { PrismaService } from '../common/prisma.service';
import { isInactive } from '../drivers/drivers.service';

const DAY = 86_400_000;
const LIVE: OrderStatus[] = ['READY', 'ASSIGNING', 'NO_RIDER', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'UNDELIVERED', 'RETURNING'];

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfWeek() { const d = startOfToday(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; }

/** Read models for the Tweniee Admin screens (A01–A15): counts for chips, rows exactly as the tables show them. */
@Injectable()
export class AdminViewsService {
  constructor(private prisma: PrismaService) {}

  /** A02: chip counts and the order table. view = live | NO_RIDER | ARRIVED | UNDELIVERED | closed. */
  async orders(q: { view?: string; search?: string }) {
    const today = startOfToday();
    const views: Record<string, Prisma.OrderWhereInput> = {
      live: { status: { in: LIVE } },
      NO_RIDER: { status: 'NO_RIDER' },
      ARRIVED: { status: 'ARRIVED' },
      UNDELIVERED: { status: { in: ['UNDELIVERED', 'RETURNING'] } },
      closed: { status: { in: ['DELIVERED', 'RETURNED', 'CANCELLED'] }, updatedAt: { gte: today } },
    };
    const counts = Object.fromEntries(await Promise.all(Object.entries(views).map(async ([k, w]) => [k, await this.prisma.order.count({ where: w })])));
    const where: Prisma.OrderWhereInput = { ...(views[q.view ?? 'live'] ?? views.live) };
    if (q.search?.trim()) {
      const t = q.search.trim();
      where.OR = [{ code: { contains: t.toUpperCase() } }, { customerPhone: { contains: t.replace(/\D/g, '') || t } }, { business: { name: { contains: t, mode: 'insensitive' } } }, { driver: { name: { contains: t, mode: 'insensitive' } } }];
    }
    const items = await this.prisma.order.findMany({
      where, orderBy: { updatedAt: 'desc' }, take: 200,
      select: { id: true, code: true, status: true, customerPhone: true, readyAt: true, createdAt: true, deliveredAt: true, returnedAt: true, cancelledAt: true, pickedUpAt: true, undeliveredAt: true, assignedAt: true, deliveryFee: true, returnFee: true, isTest: true, business: { select: { name: true } }, driver: { select: { name: true } } },
    });
    return {
      counts,
      items: items.map((o) => {
        const end = o.deliveredAt ?? o.returnedAt ?? o.cancelledAt ?? new Date();
        let charged: { amount: number; held: boolean };
        if (o.undeliveredAt) charged = { amount: o.deliveryFee + o.returnFee, held: false };
        else if (o.pickedUpAt) charged = { amount: o.deliveryFee, held: false };
        else if (o.assignedAt && !o.cancelledAt) charged = { amount: o.deliveryFee + o.returnFee, held: true };
        else charged = { amount: 0, held: false };
        return {
          id: o.id, code: o.code, status: o.status, isTest: o.isTest,
          business: o.business.name, customer: maskPhone(o.customerPhone), rider: o.driver?.name ?? null,
          sinceReadyMinutes: o.readyAt ? Math.max(0, Math.round((end.getTime() - o.readyAt.getTime()) / 60000)) : null,
          charged,
        };
      }),
    };
  }

  /** A05: queue tabs and rows. */
  async businesses(q: { status?: string; search?: string }) {
    const grouped = await this.prisma.business.groupBy({ by: ['status'], _count: true });
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
    const status = (q.status ?? 'PENDING') as never;
    const items = await this.prisma.business.findMany({
      where: { status, ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] } : {}) },
      include: { addresses: { where: { isDefault: true }, take: 1 }, documents: { select: { kind: true } } },
      orderBy: status === 'PENDING' ? [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] : { updatedAt: 'desc' },
      take: 200,
    });
    return {
      counts,
      items: items.map((b) => ({
        id: b.id, name: b.name, category: b.category, area: b.addresses[0]?.label ?? null, type: b.type,
        kycPath: b.gstin ? 'Express · GSTIN OTP' : b.documents.length ? `Manual · ${[...new Set(b.documents.map((d) => d.kind))].slice(0, 2).join(' + ')}` : 'Not uploaded yet',
        presence: [b.website && 'Website', b.instagram && 'Instagram', b.googleProfile && 'Google profile'].filter(Boolean),
        flags: [b.statusReason, !b.phoneVerifiedAt || !b.emailVerifiedAt ? 'Contact not verified' : null, !b.submittedAt && b.status === 'PENDING' ? 'Not submitted yet' : null].filter(Boolean),
        waitingSince: b.submittedAt ?? b.createdAt,
        submitted: !!b.submittedAt,
      })),
    };
  }

  /** A07 extras. */
  async businessStats(id: string) {
    const week = startOfWeek();
    const [ordersThisWeek, closed, returned, openTickets] = await Promise.all([
      this.prisma.order.count({ where: { businessId: id, createdAt: { gte: week }, isTest: false } }),
      this.prisma.order.count({ where: { businessId: id, status: { in: ['DELIVERED', 'RETURNED'] }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
      this.prisma.order.count({ where: { businessId: id, status: 'RETURNED', createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
      this.prisma.supportTicket.count({ where: { businessId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    return { ordersThisWeek, undeliveredRate30d: closed ? returned / closed : 0, openTickets };
  }

  /** A08: every key across businesses, plus the businesses waiting for whitelisting. */
  async apiKeys() {
    const [keys, failed, requested] = await Promise.all([
      this.prisma.apiKey.findMany({ include: { business: { select: { id: true, name: true, rateLimitPerMin: true, rateLimitPerDay: true, apiEnabled: true } } }, orderBy: { createdAt: 'desc' }, take: 300 }),
      this.prisma.webhookDelivery.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.business.findMany({ where: { status: 'APPROVED', apiEnabled: false, tickets: { some: { type: 'API_ACCESS', status: { in: ['OPEN', 'IN_PROGRESS'] } } } }, select: { id: true, name: true } }),
    ]);
    const names = Object.fromEntries((await this.prisma.business.findMany({ where: { id: { in: [...new Set(failed.map((f) => f.businessId))] } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
    const orderCodes = Object.fromEntries((await this.prisma.order.findMany({ where: { id: { in: failed.map((f) => f.orderId) } }, select: { id: true, code: true } })).map((o) => [o.id, o.code]));
    return {
      keys: keys.map((k) => ({
        id: k.id, keyId: k.keyId, keyMasked: `${k.keyId.slice(0, 8)}••••${k.keyId.slice(-4)}`, mode: k.mode, active: k.active, revokedAt: k.revokedAt, lastUsedAt: k.lastUsedAt,
        business: { id: k.business.id, name: k.business.name, apiEnabled: k.business.apiEnabled }, rateLimit: { perMin: k.business.rateLimitPerMin, perDay: k.business.rateLimitPerDay },
      })),
      failedWebhooks: failed.map((f) => ({ id: f.id, business: names[f.businessId] ?? f.businessId, event: f.event, orderCode: orderCodes[f.orderId] ?? null, error: f.lastError, at: f.createdAt, attempts: f.attempts })),
      requested,
    };
  }

  /** A09: drivers in onboarding with their newest link state. */
  async onboarding() {
    const drivers = await this.prisma.driver.findMany({
      where: { status: { in: ['INVITED', 'SUBMITTED', 'REJECTED'] } },
      include: { onboardingLinks: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' }, take: 200,
    });
    const now = Date.now();
    return drivers.map((d) => {
      const l = d.onboardingLinks[0];
      let link: string; let state: string;
      if (!l) { link = 'Not sent'; state = 'Draft'; }
      else if (l.usedAt) { link = 'Used'; state = d.status === 'SUBMITTED' ? 'Submitted · review' : d.status === 'REJECTED' ? (d.statusReason ?? 'Rejected') : 'Used'; }
      else if (l.revokedAt || l.expiresAt.getTime() < now) { link = 'Expired'; state = 'Link expired'; }
      else if (l.openedAt) { link = `Opened · ${Math.max(0, Math.round((l.expiresAt.getTime() - now) / 3_600_000))} h left`; state = 'Filling form'; }
      else { link = `Sent · ${Math.max(0, Math.round((l.expiresAt.getTime() - now) / 3_600_000))} h left`; state = 'Not opened yet'; }
      return { id: d.id, name: d.name, phoneMasked: maskPhone(d.phone), source: d.source, status: d.status, link, state, canReview: d.status === 'SUBMITTED', needsLink: !l || (!l.usedAt && (!!l.revokedAt || l.expiresAt.getTime() < now)) || d.status === 'REJECTED' };
    });
  }

  /** A11: tabs and rows. tab = all | ONLINE | BUSY | PAUSED | expiring | inactive. */
  async drivers(q: { tab?: string; search?: string }) {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * DAY);
    const active: Prisma.DriverWhereInput = { status: { in: ['APPROVED', 'PAUSED', 'SUSPENDED', 'BLOCKED'] } };
    const expiring: Prisma.DriverWhereInput = { ...active, OR: [{ dlExpiry: { lt: soon } }, { rcExpiry: { lt: soon } }] };
    const all = await this.prisma.driver.findMany({ where: active, select: { id: true, approvedAt: true, lastDeliveryAt: true, lastCheckInAt: true, status: true } });
    const inactiveIds = all.filter((d) => d.status === 'APPROVED' && isInactive(d, now)).map((d) => d.id);
    const tabs: Record<string, Prisma.DriverWhereInput> = {
      all: active,
      ONLINE: { status: 'APPROVED', availability: 'ONLINE' },
      BUSY: { status: { in: ['APPROVED', 'PAUSED', 'SUSPENDED', 'BLOCKED'] }, availability: 'BUSY' },
      PAUSED: { status: { in: ['PAUSED', 'SUSPENDED', 'BLOCKED'] } },
      expiring,
      inactive: { id: { in: inactiveIds } },
    };
    const counts = Object.fromEntries(await Promise.all(Object.entries(tabs).map(async ([k, w]) => [k, await this.prisma.driver.count({ where: w })])));
    const where: Prisma.DriverWhereInput = { AND: [tabs[q.tab ?? 'all'] ?? tabs.all, ...(q.search ? [{ OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { phone: { contains: q.search } }, { vehicleNumber: { contains: q.search.toUpperCase() } }] }] : [])] };
    const drivers = await this.prisma.driver.findMany({ where, include: { documents: { where: { note: { startsWith: 'RENEWAL' } }, select: { id: true } } }, orderBy: { updatedAt: 'desc' }, take: 200 });
    const week = startOfWeek();
    const [earn, live] = await Promise.all([
      this.prisma.driverEarning.groupBy({ by: ['driverId', 'leg'], where: { driverId: { in: drivers.map((d) => d.id) }, createdAt: { gte: week } }, _count: true }),
      this.prisma.order.findMany({ where: { id: { in: drivers.map((d) => d.currentOrderId).filter(Boolean) as string[] } }, select: { id: true, code: true, status: true } }),
    ]);
    const liveById = Object.fromEntries(live.map((o) => [o.id, o]));
    return {
      counts,
      items: drivers.map((d) => {
        const legs = (leg: string) => earn.find((e) => e.driverId === d.id && e.leg === leg)?._count ?? 0;
        const days = (x: Date | null) => (x ? Math.floor((x.getTime() - now.getTime()) / DAY) : null);
        const dl = days(d.dlExpiry), rc = days(d.rcExpiry);
        let docs = 'Valid';
        if ((dl ?? 0) < 0 || (rc ?? 0) < 0) docs = d.documents.length ? 'Renewal uploaded · review' : `${(dl ?? 0) < 0 ? 'DL' : 'RC'} expired`;
        else if ((rc ?? 999) <= 30 || (dl ?? 999) <= 30) docs = `${(rc ?? 999) <= (dl ?? 999) ? 'RC' : 'DL'} in ${Math.min(rc ?? 999, dl ?? 999)} days`;
        const o = d.currentOrderId ? liveById[d.currentOrderId] : null;
        return {
          id: d.id, name: d.name, source: d.source, approvedAt: d.approvedAt, status: d.status, availability: d.availability, statusReason: d.statusReason,
          liveOrder: o ? { id: o.id, code: o.code, status: o.status } : null,
          week: { deliveries: legs('DELIVERY'), returns: legs('RETURN') },
          docs, inactive: inactiveIds.includes(d.id),
        };
      }),
    };
  }

  /** A15: audit with category filter, readable actor and entity names. Document views come from DocumentView. */
  async audit(q: { category?: string; take?: string }) {
    const take = Math.min(Number(q.take ?? 200), 500);
    const cats: Record<string, Prisma.AuditLogWhereInput> = {
      wallet: { action: { startsWith: 'WALLET_' } },
      approvals: { OR: [{ action: { startsWith: 'BUSINESS_' } }, { action: { startsWith: 'DRIVER_' } }, { action: { startsWith: 'API_' } }] },
      pricing: { OR: [{ action: { contains: 'PRICE' } }, { action: { contains: 'PRICING' } }, { action: { startsWith: 'CITY_' } }] },
    };
    const logs = q.category === 'documents' ? [] : await this.prisma.auditLog.findMany({ where: cats[q.category ?? ''] ?? {}, orderBy: { createdAt: 'desc' }, take });
    const views = q.category && q.category !== 'documents' ? [] : await this.prisma.documentView.findMany({
      orderBy: { createdAt: 'desc' }, take,
      include: { document: { select: { kind: true, business: { select: { name: true } }, driver: { select: { name: true } } } } },
    });
    const rows = [
      ...logs.map((r) => ({ ...r, entityName: null as string | null })),
      ...views.map((v) => ({
        id: v.id, actorType: v.viewerType, actorId: v.viewerId, action: 'DOCUMENT_VIEW', entity: 'Document', entityId: v.documentId, oldValue: null, newValue: null, reason: null, ip: null, createdAt: v.createdAt,
        entityName: `${v.document.driver?.name ?? v.document.business?.name ?? ''} · ${v.document.kind.replace(/_FRONT|_BACK/, '').replace(/_/g, ' ')}`,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
    const ids = (entity: string) => [...new Set(rows.filter((r) => r.entity === entity && !r.entityName).map((r) => r.entityId))];
    const adminIds = [...new Set(rows.filter((r) => r.actorType === 'ADMIN' && r.actorId).map((r) => r.actorId!))];
    const [admins, businesses, drivers, cities] = await Promise.all([
      this.prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, role: true } }),
      this.prisma.business.findMany({ where: { id: { in: ids('Business') } }, select: { id: true, name: true } }),
      this.prisma.driver.findMany({ where: { id: { in: ids('Driver') } }, select: { id: true, name: true } }),
      this.prisma.city.findMany({ where: { id: { in: ids('City') } }, select: { id: true, name: true } }),
    ]);
    const adminById = Object.fromEntries(admins.map((a) => [a.id, a]));
    const names: Record<string, string> = Object.fromEntries([...businesses, ...drivers, ...cities].map((x) => [x.id, x.name]));
    return rows.map((r) => {
      const a = r.actorType === 'ADMIN' && r.actorId ? adminById[r.actorId] : null;
      return { ...r, entityName: r.entityName ?? names[r.entityId] ?? null, actor: a ? `${a.name} · ${a.role.replace('_', ' ').toLowerCase()}` : r.actorType.toLowerCase() };
    });
  }

  /** A01 extras: what needs attention right now. */
  async attention() {
    const now = new Date();
    const in15 = new Date(now.getTime() + 15 * DAY);
    const [noRider, failed, expiring, pending, oldestPending, ridersTotal] = await Promise.all([
      this.prisma.order.findMany({ where: { status: 'NO_RIDER' }, select: { id: true, code: true, readyAt: true, business: { select: { name: true } } }, orderBy: { readyAt: 'asc' }, take: 5 }),
      this.prisma.webhookDelivery.findMany({ where: { status: 'FAILED' }, distinct: ['businessId'], select: { businessId: true }, take: 5 }),
      this.prisma.driver.count({ where: { status: 'APPROVED', OR: [{ dlExpiry: { lt: in15, gt: now } }, { rcExpiry: { lt: in15, gt: now } }] } }),
      this.prisma.business.count({ where: { status: 'PENDING', submittedAt: { not: null } } }),
      this.prisma.business.findFirst({ where: { status: 'PENDING', submittedAt: { not: null } }, orderBy: { submittedAt: 'asc' }, select: { submittedAt: true } }),
      this.prisma.driver.count({ where: { status: 'APPROVED' } }),
    ]);
    const names = Object.fromEntries((await this.prisma.business.findMany({ where: { id: { in: failed.map((f) => f.businessId) } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
    return {
      ridersTotal,
      items: [
        ...noRider.map((o) => ({ kind: 'NO_RIDER', title: `${o.code} · No Rider`, detail: `${o.business.name} · Ready ${o.readyAt ? Math.round((now.getTime() - o.readyAt.getTime()) / 60000) : 0} min`, href: `/admin/orders/${o.id}` })),
        ...failed.map((f) => ({ kind: 'WEBHOOK', title: 'Webhook failed 3 times', detail: `${names[f.businessId] ?? 'Business'} · retry from API & webhooks`, href: '/admin/api' })),
        ...(expiring ? [{ kind: 'DOCS', title: `${expiring} rider document${expiring > 1 ? 's' : ''} expire in 15 days`, detail: 'Riders warned in app + SMS', href: '/admin/drivers?tab=expiring' }] : []),
        ...(pending ? [{ kind: 'BUSINESSES', title: `${pending} business${pending > 1 ? 'es' : ''} waiting review`, detail: oldestPending?.submittedAt ? `Oldest ${Math.max(1, Math.round((now.getTime() - oldestPending.submittedAt.getTime()) / 3_600_000))} h` : '', href: '/admin/businesses' }] : []),
      ],
    };
  }
}
