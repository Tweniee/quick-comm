import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { normalizePhone } from '../common/phone';
import { ORDER_INCLUDE } from '../orders/orders.service';
import { presentForBusiness } from '../orders/order-presenter';

const LIVE: OrderStatus[] = ['READY', 'ASSIGNING', 'NO_RIDER', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'UNDELIVERED', 'RETURNING'];

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function p90(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async dashboard(cityId?: string) {
    const city = cityId ? { cityId } : {};
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [byStatus, liveCount, ridersByAvail, unassigned, lowBalance, openTickets, failedWebhooks, todayOrders, pendingBusinesses, pendingDrivers] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: { ...city, createdAt: { gte: start } }, _count: true }),
      this.prisma.order.count({ where: { ...city, status: { in: LIVE } } }),
      this.prisma.driver.groupBy({ by: ['availability'], where: { ...city, status: 'APPROVED' }, _count: true }),
      this.prisma.order.findMany({ where: { ...city, status: { in: ['ASSIGNING', 'NO_RIDER'] } }, select: { id: true, code: true, status: true, readyAt: true, business: { select: { name: true } } }, orderBy: { readyAt: 'asc' }, take: 50 }),
      this.prisma.$queryRaw<{ id: string; name: string; available: number }[]>`SELECT id, name, ("walletBalance" - "walletHeld") AS available FROM "Business" WHERE status = 'APPROVED' AND ("walletBalance" - "walletHeld") < 20000 ORDER BY available ASC LIMIT 50`,
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.webhookDelivery.count({ where: { status: 'FAILED' } }),
      this.prisma.order.findMany({ where: { ...city, createdAt: { gte: start }, isTest: false }, select: { readyAt: true, assignedAt: true, deliveredAt: true, status: true, assignmentAttempts: true } }),
      this.prisma.business.count({ where: { status: 'PENDING' } }),
      this.prisma.driver.count({ where: { status: 'SUBMITTED' } }),
    ]);
    const readyToAssigned = todayOrders.filter((o) => o.readyAt && o.assignedAt).map((o) => (o.assignedAt!.getTime() - o.readyAt!.getTime()) / 1000);
    const readyToDelivered = todayOrders.filter((o) => o.readyAt && o.deliveredAt).map((o) => (o.deliveredAt!.getTime() - o.readyAt!.getTime()) / 60000);
    const attempted = todayOrders.filter((o) => o.assignmentAttempts > 0);
    const assigned = attempted.filter((o) => o.assignedAt);
    const closed = todayOrders.filter((o) => ['DELIVERED', 'RETURNED'].includes(o.status));
    return {
      today: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      liveOrders: liveCount,
      riders: Object.fromEntries(ridersByAvail.map((r) => [r.availability, r._count])),
      unassigned,
      lowBalanceBusinesses: lowBalance,
      openTickets,
      failedWebhooks,
      queues: { pendingBusinesses, pendingDrivers },
      metrics: {
        assignmentSuccessRate: attempted.length ? assigned.length / attempted.length : null,
        readyToAcceptedSeconds: { median: median(readyToAssigned), p90: p90(readyToAssigned) },
        readyToDeliveredMinutes: { median: median(readyToDelivered) },
        deliveredRate: closed.length ? closed.filter((o) => o.status === 'DELIVERED').length / closed.length : null,
      },
    };
  }

  /** Live map: live orders and online riders with last known location. */
  async liveMap(cityId?: string) {
    const city = cityId ? { cityId } : {};
    const [orders, riders] = await Promise.all([
      this.prisma.order.findMany({ where: { ...city, status: { in: LIVE } }, select: { id: true, code: true, status: true, dropLat: true, dropLng: true, driverId: true, pickupAddress: { select: { lat: true, lng: true } } } }),
      this.prisma.driver.findMany({ where: { ...city, availability: { in: ['ONLINE', 'BUSY'] } }, select: { id: true, name: true, availability: true, lastLat: true, lastLng: true, lastLocationAt: true, currentOrderId: true } }),
    ]);
    return { orders, riders };
  }

  /** One search box: phone, order code, business name, rider name (masterplan §13). */
  async search(q: string) {
    const term = q.trim();
    if (term.length < 2) return { orders: [], businesses: [], drivers: [] };
    const phone = normalizePhone(term);
    const [orders, businesses, drivers] = await Promise.all([
      this.prisma.order.findMany({
        where: { OR: [{ code: { contains: term.toUpperCase() } }, { id: term }, { businessReferenceId: term }, ...(phone ? [{ customerPhone: phone }] : []), { customerName: { contains: term, mode: 'insensitive' } }] },
        select: { id: true, code: true, status: true, customerName: true, customerPhone: true, createdAt: true, business: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }, take: 20,
      }),
      this.prisma.business.findMany({ where: { OR: [{ name: { contains: term, mode: 'insensitive' } }, ...(phone ? [{ phone }] : []), { email: { contains: term, mode: 'insensitive' } }] }, select: { id: true, name: true, phone: true, status: true }, take: 20 }),
      this.prisma.driver.findMany({ where: { OR: [{ name: { contains: term, mode: 'insensitive' } }, ...(phone ? [{ phone }] : []), { vehicleNumber: { contains: term.toUpperCase().replace(/\s/g, '') } }] }, select: { id: true, name: true, phone: true, status: true, availability: true }, take: 20 }),
    ]);
    return { orders, businesses, drivers };
  }

  async listOrders(q: { status?: string; businessId?: string; driverId?: string; flagged?: string; take?: string; skip?: string }) {
    const where = {
      ...(q.status ? { status: { in: q.status.split(',') as OrderStatus[] } } : {}),
      ...(q.businessId ? { businessId: q.businessId } : {}),
      ...(q.driverId ? { driverId: q.driverId } : {}),
      ...(q.flagged === 'true' ? { NOT: { flags: { isEmpty: true } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: { pickupAddress: true, driver: true, business: { select: { name: true, phone: true } } }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(q.take ?? 50), 200), skip: Number(q.skip ?? 0) }),
      this.prisma.order.count({ where }),
    ]);
    return { total, items: items.map((o) => ({ ...presentForBusiness(o), businessName: o.business?.name })) };
  }

  /** Everything support needs to answer "why ₹60" on one screen. */
  async orderDetail(id: string) {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }] }, include: { ...ORDER_INCLUDE, business: { select: { id: true, name: true, phone: true } } } });
    if (!o) throw Errors.notFound('Order');
    const [ledger, calls, otpEvents, offers, notifications, tickets, earnings] = await Promise.all([
      this.prisma.walletLedger.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.callLog.findMany({ where: { orderId: o.id }, orderBy: { calledAt: 'asc' } }),
      this.prisma.otpEvent.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.assignmentOffer.findMany({ where: { orderId: o.id }, include: { driver: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.notificationLog.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.supportTicket.findMany({ where: { orderId: o.id }, select: { id: true, subject: true, status: true, type: true } }),
      this.prisma.driverEarning.findMany({ where: { orderId: o.id } }),
    ]);
    const waitMinutes = o.arrivedAt ? ((o.undeliveredAt ?? o.deliveredAt ?? new Date()).getTime() - o.arrivedAt.getTime()) / 60000 : null;
    return {
      order: presentForBusiness(o),
      business: o.business,
      driver: o.driver ? { id: o.driver.id, name: o.driver.name, phone: o.driver.phone, vehicleNumber: o.driver.vehicleNumber } : null,
      ledger, calls, otpEvents, offers, notifications, tickets, earnings,
      evidence: {
        waitMinutes,
        customerCalls: calls.filter((c) => c.target === 'CUSTOMER').length,
        otpFailedAttempts: o.otpFailedAttempts,
        gpsAtArrival: o.timeline?.find((t) => t.status === 'ARRIVED')?.lat != null,
        flags: o.flags,
      },
    };
  }

  auditLog(q: { entity?: string; entityId?: string; actorId?: string; take?: string }) {
    return this.prisma.auditLog.findMany({
      where: { ...(q.entity ? { entity: q.entity } : {}), ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.actorId ? { actorId: q.actorId } : {}) },
      orderBy: { createdAt: 'desc' }, take: Math.min(Number(q.take ?? 100), 500),
    });
  }

  listStaff() {
    return this.prisma.adminUser.findMany({ select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  }

  async createStaff(input: { name: string; email: string; password: string; role: 'SUPER_ADMIN' | 'SUPPORT' | 'STAFF' }, adminId: string) {
    if (input.password.length < 10) throw new AppError('WEAK_PASSWORD', 'Staff passwords must be at least 10 characters', 422);
    const u = await this.prisma.adminUser.create({ data: { name: input.name, email: input.email.toLowerCase(), role: input.role, passwordHash: await bcrypt.hash(input.password, 10) } });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'STAFF_CREATE', entity: 'AdminUser', entityId: u.id, newValue: { email: u.email, role: u.role } });
    return { id: u.id, name: u.name, email: u.email, role: u.role };
  }

  async setStaffActive(id: string, active: boolean, adminId: string) {
    if (id === adminId) throw new AppError('SELF_CHANGE', 'You cannot deactivate yourself', 409);
    const u = await this.prisma.adminUser.update({ where: { id }, data: { active } });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: active ? 'STAFF_ACTIVATE' : 'STAFF_DEACTIVATE', entity: 'AdminUser', entityId: id });
    return { id: u.id, active: u.active };
  }

  notifications(q: { to?: string; orderId?: string }) {
    return this.prisma.notificationLog.findMany({ where: { ...(q.to ? { to: q.to } : {}), ...(q.orderId ? { orderId: q.orderId } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
