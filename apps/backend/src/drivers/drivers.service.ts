import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { maskPhone } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { DocumentsService, UploadedFileLike } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY = 86_400_000;

@Injectable()
export class DriversService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notify: NotificationsService, private docs: DocumentsService) {}

  async me(driverId: string) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    const now = Date.now();
    const expiring = [
      d.dlExpiry && { doc: 'DL', expiresAt: d.dlExpiry, daysLeft: Math.floor((d.dlExpiry.getTime() - now) / DAY) },
      d.rcExpiry && { doc: 'RC', expiresAt: d.rcExpiry, daysLeft: Math.floor((d.rcExpiry.getTime() - now) / DAY) },
    ].filter((x): x is { doc: string; expiresAt: Date; daysLeft: number } => !!x && x.daysLeft <= 30);
    return {
      id: d.id, name: d.name, phone: d.phone, status: d.status, statusReason: d.statusReason, availability: d.availability,
      vehicleNumber: d.vehicleNumber, bankAccount: d.bankAccountLast4 ? `XXXX${d.bankAccountLast4}` : null, ifsc: d.ifsc,
      preferredLanguage: d.preferredLanguage, totalDeliveries: d.totalDeliveries, totalReturns: d.totalReturns,
      currentOrderId: d.currentOrderId, expiryWarnings: expiring,
    };
  }

  async setLanguage(driverId: string, lang: string) {
    await this.prisma.driver.update({ where: { id: driverId }, data: { preferredLanguage: lang === 'hi' ? 'hi' : 'en' } });
    return this.me(driverId);
  }

  /** Offline by default. Going online requires an approved account with valid DL and RC. */
  async setOnline(driverId: string, online: boolean, loc?: { lat: number; lng: number }) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId }, include: { city: true } });
    if (!online) {
      if (d.currentOrderId) throw new AppError('ON_LIVE_ORDER', 'Finish your current order before going offline', 409);
      await this.prisma.driver.update({ where: { id: driverId }, data: { availability: 'OFFLINE' } });
      await this.prisma.assignmentOffer.updateMany({ where: { driverId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } });
      return this.me(driverId);
    }
    if (d.status !== 'APPROVED') throw new AppError('DRIVER_NOT_ACTIVE', d.status === 'PAUSED' ? `Your account is paused: ${d.statusReason ?? 'contact support'}` : 'Your account is not active', 403, 'CONTACT_SUPPORT');
    const now = new Date();
    if (!d.dlExpiry || d.dlExpiry < now || !d.rcExpiry || d.rcExpiry < now) {
      await this.prisma.driver.update({ where: { id: driverId }, data: { status: 'PAUSED', statusReason: 'Driving Licence or RC expired. Upload renewed document.' } });
      throw new AppError('DOCUMENT_EXPIRED', 'Your DL or RC has expired. Upload the renewed document to continue.', 403, 'UPLOAD_RENEWAL');
    }
    if (d.city.status === 'PAUSED') throw Errors.cityPaused(d.city.pauseMessage);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { availability: d.currentOrderId ? 'BUSY' : 'ONLINE', ...(loc ? { lastLat: loc.lat, lastLng: loc.lng, lastLocationAt: now } : {}) },
    });
    return this.me(driverId);
  }

  /** Location is only accepted while online or on a job (privacy, masterplan §14). */
  async updateLocation(driverId: string, lat: number, lng: number) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError('INVALID_LOCATION', 'Invalid coordinates', 422);
    const res = await this.prisma.driver.updateMany({ where: { id: driverId, availability: { in: ['ONLINE', 'BUSY'] } }, data: { lastLat: lat, lastLng: lng, lastLocationAt: new Date() } });
    return { accepted: res.count === 1 };
  }

  async earnings(driverId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Monday
    const [today, week, unpaid, recent, payouts] = await Promise.all([
      this.prisma.driverEarning.aggregate({ where: { driverId, createdAt: { gte: startOfDay } }, _sum: { amount: true }, _count: true }),
      this.prisma.driverEarning.aggregate({ where: { driverId, createdAt: { gte: startOfWeek } }, _sum: { amount: true }, _count: true }),
      this.prisma.driverEarning.aggregate({ where: { driverId, payoutId: null }, _sum: { amount: true } }),
      this.prisma.driverEarning.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.driverPayout.findMany({ where: { driverId }, orderBy: { weekStart: 'desc' }, take: 12 }),
    ]);
    const codes = await this.prisma.order.findMany({ where: { id: { in: recent.map((r) => r.orderId) } }, select: { id: true, code: true } });
    const codeById = new Map(codes.map((c) => [c.id, c.code]));
    return {
      today: { amount: today._sum.amount ?? 0, legs: today._count },
      thisWeek: { amount: week._sum.amount ?? 0, legs: week._count },
      unpaid: unpaid._sum.amount ?? 0,
      recent: recent.map((r) => ({ ...r, orderCode: codeById.get(r.orderId) })),
      payouts,
      payoutNote: 'Paid weekly to your verified bank account.',
    };
  }

  /** Renewed DL/RC upload while PAUSED (or ahead of expiry). Support reviews and unpauses. */
  async uploadRenewal(driverId: string, kind: 'DL_FRONT' | 'DL_BACK' | 'RC_FRONT' | 'RC_BACK', expiry: string, file: UploadedFileLike) {
    if (!['DL_FRONT', 'DL_BACK', 'RC_FRONT', 'RC_BACK'].includes(kind)) throw new AppError('INVALID_DOC_KIND', 'Only DL or RC renewals can be uploaded here', 422);
    const doc = await this.docs.store(file, { ownerType: 'DRIVER', kind, driverId });
    await this.prisma.document.update({ where: { id: doc.id }, data: { note: `RENEWAL expiry=${expiry}` } });
    await this.prisma.supportTicket.create({ data: { driverId, type: 'RIDER_ISSUE', subject: `Document renewal uploaded: ${kind}`, messages: { create: { authorType: 'DRIVER', authorId: driverId, body: `New expiry ${expiry}` } } } });
    return { uploaded: true, message: 'Uploaded. Support will verify and reactivate your account.' };
  }

  /** One-tap help during a live order. */
  async helpRequest(driverId: string, orderId: string, message?: string) {
    const o = await this.prisma.order.findFirst({ where: { id: orderId, driverId } });
    if (!o) throw Errors.notFound('Order');
    return this.prisma.supportTicket.create({
      data: { driverId, orderId, businessId: o.businessId, type: 'RIDER_ISSUE', priority: 'HIGH', subject: `Rider needs help on ${o.code}`, messages: { create: { authorType: 'DRIVER', authorId: driverId, body: message || 'Help requested' } } },
    });
  }

  // ── Admin-facing ──
  async adminList(q: { status?: string; search?: string; cityId?: string }) {
    const items = await this.prisma.driver.findMany({
      where: {
        ...(q.status ? { status: { in: q.status.split(',') as never } } : {}),
        ...(q.cityId ? { cityId: q.cityId } : {}),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { vehicleNumber: { contains: q.search.toUpperCase() } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return items.map((d) => this.adminView(d));
  }

  adminView(d: Awaited<ReturnType<PrismaService['driver']['findUniqueOrThrow']>>) {
    const { bankAccountEnc, aadhaarHash, ...rest } = d;
    return { ...rest, phoneMasked: maskPhone(d.phone), aadhaar: d.aadhaarLast4 ? `XXXX XXXX ${d.aadhaarLast4}` : null, bankAccount: d.bankAccountLast4 ? `XXXX${d.bankAccountLast4}` : null };
  }

  async adminDetail(id: string) {
    const d = await this.prisma.driver.findUnique({ where: { id }, include: { documents: { orderBy: { createdAt: 'desc' } }, onboardingLinks: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, expiresAt: true, usedAt: true, revokedAt: true, createdAt: true } } } });
    if (!d) throw Errors.notFound('Driver');
    const duplicates = await this.prisma.driver.findMany({ where: { id: { not: id }, OR: [{ phone: d.phone }, ...(d.dlNumber ? [{ dlNumber: d.dlNumber }] : []), ...(d.aadhaarHash ? [{ aadhaarHash: d.aadhaarHash }] : [])] }, select: { id: true, name: true, status: true } });
    const now = Date.now();
    const checks = {
      ageOk: d.dob ? (now - d.dob.getTime()) / (365.25 * DAY) >= 18 : false,
      dlValid30Days: d.dlExpiry ? d.dlExpiry.getTime() > now + 30 * DAY : false,
      rcValid: d.rcExpiry ? d.rcExpiry.getTime() > now : false,
      bankNameMatches: d.accountHolderName ? d.accountHolderName.trim().toLowerCase() === d.name.trim().toLowerCase() : false,
      allDocsUploaded: ['DL_FRONT', 'DL_BACK', 'RC_FRONT', 'RC_BACK', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'BANK_PROOF', 'SELFIE', 'BIKE_PHOTO'].every((k) => d.documents.some((x) => x.kind === k)),
      noDuplicates: duplicates.length === 0,
    };
    const { documents, onboardingLinks, ...driver } = d;
    return { driver: this.adminView(driver as never), documents, onboardingLinks, duplicates, checks, manualChecklist: [
      'Selfie is the same person as the DL photo',
      'Bike in photo matches the RC and vehicle number',
      'Bank account holder name matches the driver',
      'Address is plausible for the city',
    ] };
  }

  async review(id: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_REUPLOAD' | 'SUSPEND' | 'BLOCK' | 'PAUSE' | 'REACTIVATE', reason: string | undefined, adminId: string, extra: { dlExpiry?: string; rcExpiry?: string } = {}) {
    const d = await this.prisma.driver.findUnique({ where: { id }, include: { documents: true } });
    if (!d) throw Errors.notFound('Driver');
    if (action !== 'APPROVE' && action !== 'REACTIVATE' && !reason?.trim()) throw new AppError('REASON_REQUIRED', 'A reason is required', 422);
    const now = Date.now();
    let data: Record<string, unknown> = {};
    switch (action) {
      case 'APPROVE': {
        if (d.status !== 'SUBMITTED') throw new AppError('NOT_REVIEWABLE', 'Only submitted drivers can be approved', 409);
        if (!d.dlExpiry || d.dlExpiry.getTime() < now + 30 * DAY) throw new AppError('DL_EXPIRING', 'Never approve a driver whose DL is expired or expiring within 30 days', 409);
        if (!d.rcExpiry || d.rcExpiry.getTime() < now) throw new AppError('RC_EXPIRED', 'RC has expired', 409);
        data = { status: 'APPROVED', statusReason: null, approvedAt: new Date(), approvedByAdminId: adminId };
        break;
      }
      case 'REJECT': data = { status: 'REJECTED', statusReason: reason, availability: 'OFFLINE' }; break;
      case 'REQUEST_REUPLOAD': data = { status: 'REJECTED', statusReason: `Re-upload needed: ${reason}` }; break;
      case 'SUSPEND': data = { status: 'SUSPENDED', statusReason: reason, availability: 'OFFLINE' }; break;
      case 'BLOCK': data = { status: 'BLOCKED', statusReason: reason, availability: 'OFFLINE' }; break;
      case 'PAUSE': data = { status: 'PAUSED', statusReason: reason, availability: 'OFFLINE' }; break;
      case 'REACTIVATE': {
        if (!['PAUSED', 'SUSPENDED'].includes(d.status)) throw new AppError('NOT_REACTIVATABLE', 'Only paused or suspended drivers can be reactivated', 409);
        const dl = extra.dlExpiry ? new Date(extra.dlExpiry) : d.dlExpiry;
        const rc = extra.rcExpiry ? new Date(extra.rcExpiry) : d.rcExpiry;
        if (!dl || dl.getTime() < now || !rc || rc.getTime() < now) throw new AppError('DOCUMENT_EXPIRED', 'Update DL/RC expiry from the renewed document before reactivating', 409);
        data = { status: 'APPROVED', statusReason: null, dlExpiry: dl, rcExpiry: rc };
        break;
      }
    }
    if (['SUSPEND', 'BLOCK', 'PAUSE'].includes(action) && d.currentOrderId) {
      // Live order stays with the rider until support reassigns; we only stop new offers.
      data.availability = 'BUSY';
    }
    const updated = await this.prisma.driver.update({ where: { id }, data });
    if (['SUSPEND', 'BLOCK'].includes(action)) {
      await this.prisma.driverPayout.updateMany({ where: { driverId: id, status: 'PENDING' }, data: { status: 'HELD' } });
    }
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: `DRIVER_${action}`, entity: 'Driver', entityId: id, oldValue: { status: d.status }, newValue: { status: updated.status }, reason });
    const msg: Partial<Record<typeof action, string>> = {
      APPROVE: 'Your documents are approved, download the Quick Delivery Partner app and go online when you are ready.',
      REJECT: `Your partner application was not approved: ${reason}.`,
      REQUEST_REUPLOAD: `Please re-upload: ${reason}. Our staff will send you a new link.`,
      SUSPEND: `Your partner account is suspended: ${reason}. You can appeal by calling support.`,
      PAUSE: `Your partner account is paused: ${reason}.`,
      REACTIVATE: 'Your partner account is active again.',
    };
    if (msg[action]) await this.notify.sendSmsAndWhatsapp({ to: d.phone, template: `DRIVER_${action}`, body: msg[action]! });
    return this.adminView(updated);
  }
}
