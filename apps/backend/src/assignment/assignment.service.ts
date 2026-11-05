import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { config } from '../common/config';
import { decrypt, safeEqual } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { haversineKm } from '../common/geo';
import { splitFee } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OrderEventsService } from '../orders/order-events.service';
import { presentForDriver } from '../orders/order-presenter';
import { Actor, OrderStateService } from '../orders/order-state.service';
import { UNDELIVERED_REASONS, UndeliveredReason } from '../orders/order-status';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';

const LOCATION_FRESH_MS = 5 * 60_000;
const ARRIVAL_RADIUS_KM = 0.5;

export interface GeoStamp { lat?: number; lng?: number; occurredAt?: string }

/**
 * Dispatch and the live delivery flow.
 *
 * Assignment (masterplan §6): offer to the nearest online rider, 30 s to decide; on decline/timeout offer the next
 * nearest, up to 5 riders or 3 minutes. Then NO_RIDER, honestly. One order per rider, ever.
 */
@Injectable()
export class AssignmentService {
  private log = new Logger('Assignment');
  constructor(
    private prisma: PrismaService,
    private state: OrderStateService,
    private wallet: WalletService,
    private events: OrderEventsService,
    private realtime: RealtimeGateway,
    private notify: NotificationsService,
    @Inject(forwardRef(() => OrdersService)) private _orders: OrdersService,
  ) {}

  // ───────────────────────── Assignment ─────────────────────────

  async start(orderId: string, actor: Actor) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx, o, 'ASSIGNING', actor, { data: { assignmentAttempts: { increment: 1 } } }),
    );
    await this.events.emit(orderId, 'ASSIGNING');
    await this.offerNext(orderId);
  }

  /** Offer the order to the next nearest eligible rider, or give up with NO_RIDER. */
  async offerNext(orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { pickupAddress: true, business: { select: { name: true } } } });
    if (!o || o.status !== 'ASSIGNING') return null;
    const round = o.assignmentAttempts;
    const roundOffers = await this.prisma.assignmentOffer.findMany({ where: { orderId, round }, orderBy: { createdAt: 'asc' } });
    if (roundOffers.some((x) => x.status === 'PENDING')) return null; // one live offer at a time
    const roundStartedAt = roundOffers[0]?.createdAt ?? new Date();
    const elapsed = Date.now() - roundStartedAt.getTime();
    if (roundOffers.length >= config.assignmentMaxRiders || elapsed >= config.assignmentMaxSeconds * 1000) {
      return this.noRider(orderId);
    }
    const offered = new Set(roundOffers.map((x) => x.driverId));
    const candidates = await this.prisma.driver.findMany({
      where: {
        cityId: o.cityId,
        status: 'APPROVED',
        availability: 'ONLINE',
        currentOrderId: null,
        lastLat: { not: null },
        lastLocationAt: { gt: new Date(Date.now() - LOCATION_FRESH_MS) },
        offers: { none: { status: 'PENDING' } },
      },
      select: { id: true, lastLat: true, lastLng: true, name: true },
    });
    const ranked = candidates
      .filter((d) => !offered.has(d.id))
      .map((d) => ({ ...d, km: haversineKm(o.pickupAddress.lat, o.pickupAddress.lng, d.lastLat!, d.lastLng!) }))
      .sort((a, b) => a.km - b.km);
    const next = ranked[0];
    if (!next) return this.noRider(orderId);

    const offer = await this.prisma.assignmentOffer.create({
      data: { orderId, driverId: next.id, round, distanceKm: Math.round(next.km * 100) / 100, expiresAt: new Date(Date.now() + config.offerTimeoutSeconds * 1000) },
    });
    const earning = splitFee(o.deliveryFee, o.driverSharePct).driver;
    this.realtime.emit(`driver:${next.id}`, 'offer.new', { offerId: offer.id, orderId, expiresAt: offer.expiresAt });
    await this.notify.send({
      channel: 'PUSH', to: `driver:${next.id}`, template: 'RIDER_NEW_JOB', orderId,
      body: `New job, pickup ${o.business.name}, drop ${o.dropPincode ?? 'nearby'}, fee ₹${earning / 100}, Accept in ${config.offerTimeoutSeconds} seconds.`,
    });
    return offer;
  }

  private async noRider(orderId: string) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status !== 'ASSIGNING') return null;
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx, o, 'NO_RIDER', { type: 'SYSTEM' }, { reason: 'No rider available at this moment in your area. Please retry in 10 minutes.' }),
    );
    await this.events.emit(orderId, 'NO_RIDER');
    return null;
  }

  /** Pending offer for a rider (polling fallback for the Driver App). */
  async pendingOffer(driverId: string) {
    const offer = await this.prisma.assignmentOffer.findFirst({
      where: { driverId, status: 'PENDING', expiresAt: { gt: new Date() } },
      include: { order: { include: { pickupAddress: true, business: { select: { name: true, phone: true } } } } },
    });
    if (!offer) return null;
    const o = offer.order;
    return {
      offerId: offer.id,
      expiresAt: offer.expiresAt,
      distanceToPickupKm: offer.distanceKm,
      pickup: { businessName: o.business.name, address: o.pickupAddress.address, lat: o.pickupAddress.lat, lng: o.pickupAddress.lng },
      drop: { area: o.dropPincode, distanceKm: Math.round(haversineKm(o.pickupAddress.lat, o.pickupAddress.lng, o.dropLat, o.dropLng) * 10) / 10 },
      parcel: { description: o.parcelDescription, weightGrams: o.weightGrams, isFragile: o.isFragile },
      earning: splitFee(o.deliveryFee, o.driverSharePct).driver,
    };
  }

  async accept(driverId: string, offerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.assignmentOffer.findUnique({ where: { id: offerId }, include: { order: true } });
      if (!offer || offer.driverId !== driverId) throw Errors.notFound('Offer');
      if (offer.status !== 'PENDING' || offer.expiresAt < new Date()) throw new AppError('OFFER_EXPIRED', 'This job is no longer available', 409);
      const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId } });
      if (driver.status !== 'APPROVED') throw new AppError('DRIVER_NOT_ACTIVE', 'Your account is not active', 403);
      if (driver.currentOrderId) throw new AppError('ALREADY_ON_JOB', 'Finish your current order first', 409);
      const o = offer.order;
      if (o.status !== 'ASSIGNING') throw new AppError('OFFER_EXPIRED', 'This job is no longer available', 409);

      // Claim the rider (one order per rider, enforced by a unique currentOrderId and a conditional update).
      const claimed = await tx.driver.updateMany({ where: { id: driverId, currentOrderId: null, availability: 'ONLINE' }, data: { currentOrderId: o.id, availability: 'BUSY' } });
      if (claimed.count !== 1) throw new AppError('NOT_AVAILABLE', 'Go online to accept jobs', 409);

      // Hold the forward fee. If the wallet cannot cover it, release the rider and stop assignment.
      try {
        await this.wallet.hold(tx, o.businessId, o.id, o.code, o.deliveryFee, offer.id);
      } catch (e) {
        if (e instanceof AppError && e.code === 'INSUFFICIENT_WALLET') return { walletFailed: true as const, orderId: o.id };
        throw e;
      }
      await tx.assignmentOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      await tx.assignmentOffer.updateMany({ where: { orderId: o.id, status: 'PENDING', id: { not: offer.id } }, data: { status: 'CANCELLED' } });
      await this.state.transition(tx, o, 'ASSIGNED', { type: 'DRIVER', id: driverId }, { lat: driver.lastLat, lng: driver.lastLng, data: { driverId, ...OrdersService.newOtps(), otpFailedAttempts: 0, otpLocked: false } });
      return { walletFailed: false as const, orderId: o.id };
    });

    if (result.walletFailed) {
      // Transaction above returned before writing; persist the failure outside it.
      await this.prisma.$transaction(async (tx) => {
        await tx.driver.updateMany({ where: { id: driverId, currentOrderId: result.orderId }, data: { currentOrderId: null, availability: 'ONLINE' } });
        await tx.assignmentOffer.update({ where: { id: offerId }, data: { status: 'CANCELLED', respondedAt: new Date() } });
        const o = await tx.order.findUniqueOrThrow({ where: { id: result.orderId } });
        if (o.status === 'ASSIGNING') {
          await this.state.transition(tx, o, 'NO_RIDER', { type: 'SYSTEM' }, { reason: 'Wallet balance too low to assign a rider. Recharge and retry.' });
        }
      });
      await this.events.emit(result.orderId, 'NO_RIDER');
      throw new AppError('OFFER_EXPIRED', 'This job is no longer available', 409);
    }
    await this.events.emit(result.orderId, 'ASSIGNED');
    return this.currentJob(driverId);
  }

  async decline(driverId: string, offerId: string) {
    const offer = await this.prisma.assignmentOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId) throw Errors.notFound('Offer');
    const res = await this.prisma.assignmentOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } });
    if (res.count) await this.offerNext(offer.orderId);
    return { ok: true };
  }

  /** Called every few seconds: expire stale offers and move on; auto-NO_RIDER rounds that ran out of time. */
  async tick() {
    const expired = await this.prisma.assignmentOffer.findMany({ where: { status: 'PENDING', expiresAt: { lte: new Date() } }, select: { id: true, orderId: true } });
    for (const e of expired) {
      const r = await this.prisma.assignmentOffer.updateMany({ where: { id: e.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      if (r.count) await this.offerNext(e.orderId);
    }
    const stuck = await this.prisma.order.findMany({ where: { status: 'ASSIGNING', offers: { none: { status: 'PENDING' } } }, select: { id: true } });
    for (const s of stuck) await this.offerNext(s.id);
    return { expired: expired.length, stuck: stuck.length };
  }

  /** Support: take the order off the current rider (before pickup) and assign again. */
  async supportReassign(orderId: string, adminId: string, reason: string) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status !== 'ASSIGNED') throw new AppError('NOT_REASSIGNABLE', 'Only orders assigned but not picked up can be reassigned', 409);
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.release(tx, o.businessId, o.id, o.code, 'rider unassigned by support');
      if (o.driverId) await tx.driver.updateMany({ where: { id: o.driverId, currentOrderId: o.id }, data: { currentOrderId: null, availability: 'ONLINE' } });
      await this.state.transition(tx, o, 'ASSIGNING', { type: 'SUPPORT', id: adminId }, { reason, data: { driverId: null, assignmentAttempts: { increment: 1 } } });
    });
    await this.events.emit(orderId, 'ASSIGNING');
    await this.offerNext(orderId);
  }

  /** Support: force another assignment round for a NO_RIDER order (beyond the business's own retry). */
  async supportRetry(orderId: string, adminId: string) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status !== 'NO_RIDER') throw new AppError('NOT_RETRYABLE', 'Order is not waiting for a rider', 409);
    await this.start(orderId, { type: 'SUPPORT', id: adminId });
  }

  // ───────────────────────── Live job (rider) ─────────────────────────

  private async liveOrder(driverId: string, orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!o || o.driverId !== driverId) throw Errors.notFound('Order');
    return o;
  }

  async currentJob(driverId: string) {
    const d = await this.prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    if (!d.currentOrderId) return null;
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: d.currentOrderId }, include: { pickupAddress: true, business: { select: { name: true, phone: true } } } });
    const calls = await this.prisma.callLog.count({ where: { orderId: o.id, driverId, target: 'CUSTOMER' } });
    return { ...presentForDriver(o), customerCalls: calls, minCallsRequired: config.minCallsBeforeUndelivered };
  }

  private stamp(g: GeoStamp) {
    const t = g.occurredAt ? new Date(g.occurredAt) : undefined;
    // Offline actions keep their original time, but never a future time and never older than 6 hours.
    const ok = t && !isNaN(t.getTime()) && t.getTime() <= Date.now() && t.getTime() > Date.now() - 6 * 3_600_000;
    return { lat: g.lat ?? null, lng: g.lng ?? null, occurredAt: ok ? t : undefined };
  }

  /** Rider confirms pickup after checking the seal and label. Converts the hold into the forward charge. */
  async pickup(driverId: string, orderId: string, g: GeoStamp, photoDocumentId?: string) {
    const o = await this.liveOrder(driverId, orderId);
    if (['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.status)) return this.currentJob(driverId); // offline replay
    const s = this.stamp(g);
    await this.prisma.$transaction(async (tx) => {
      const picked = await this.state.transition(tx, o, 'PICKED_UP', { type: 'DRIVER', id: driverId }, { ...s, note: photoDocumentId ? `photo:${photoDocumentId}` : undefined });
      if (!o.isTest) await this.wallet.chargeForward(tx, o.businessId, o.id, o.code, o.deliveryFee);
      await this.state.transition(tx, picked, 'OUT_FOR_DELIVERY', { type: 'SYSTEM' }, { occurredAt: s.occurredAt });
    });
    await this.events.emit(o.id, 'PICKED_UP');
    await this.events.emit(o.id, 'OUT_FOR_DELIVERY');
    return this.currentJob(driverId);
  }

  /** Rider refuses pickup (suspicious, oversize, not sealed). No charge; support investigates. Rider is not penalised. */
  async refusePickup(driverId: string, orderId: string, reason: 'SUSPICIOUS' | 'OVERSIZE' | 'NOT_SEALED' | 'NOT_READY', note: string | undefined, g: GeoStamp) {
    const o = await this.liveOrder(driverId, orderId);
    if (o.status !== 'ASSIGNED') throw Errors.invalidTransition(o.status, 'CANCELLED');
    const s = this.stamp(g);
    await this.prisma.$transaction(async (tx) => {
      await this.wallet.release(tx, o.businessId, o.id, o.code, `rider refused pickup (${reason})`);
      await tx.driver.update({ where: { id: driverId }, data: { currentOrderId: null, availability: 'ONLINE' } });
      await this.state.transition(tx, o, 'CANCELLED', { type: 'DRIVER', id: driverId }, { ...s, reason: `Rider refused pickup: ${reason}`, note, data: { cancelReason: `Rider refused pickup: ${reason}`, flags: { push: `REFUSED_${reason}` } } });
      await tx.supportTicket.create({
        data: {
          businessId: o.businessId, driverId, orderId: o.id,
          type: reason === 'SUSPICIOUS' ? 'SUSPICIOUS_PARCEL' : 'BUSINESS_ISSUE',
          subject: `Rider refused pickup for ${o.code}: ${reason}`,
          priority: reason === 'SUSPICIOUS' ? 'URGENT' : 'NORMAL',
          messages: { create: { authorType: 'DRIVER', authorId: driverId, body: note || reason } },
        },
      });
    });
    await this.events.emit(o.id, 'CANCELLED');
    return { ok: true };
  }

  async arrived(driverId: string, orderId: string, g: GeoStamp) {
    const o = await this.liveOrder(driverId, orderId);
    if (o.status === 'ARRIVED') return this.currentJob(driverId);
    const s = this.stamp(g);
    const flags: string[] = [];
    if (s.lat == null || s.lng == null) flags.push('ARRIVED_WITHOUT_GPS');
    else if (haversineKm(s.lat, s.lng, o.dropLat, o.dropLng) > ARRIVAL_RADIUS_KM) flags.push('ARRIVED_FAR_FROM_DROP');
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx, o, 'ARRIVED', { type: 'DRIVER', id: driverId }, { ...s, data: flags.length ? { flags: { push: flags } } : {} }),
    );
    await this.events.emit(o.id, 'ARRIVED');
    return this.currentJob(driverId);
  }

  async logCall(driverId: string, orderId: string, target: 'CUSTOMER' | 'BUSINESS' | 'SUPPORT', outcome: string | undefined, g: GeoStamp) {
    await this.liveOrder(driverId, orderId);
    return this.prisma.callLog.create({ data: { orderId, driverId, target, outcome, lat: g.lat, lng: g.lng, calledAt: g.occurredAt ? new Date(g.occurredAt) : new Date() } });
  }

  /** No OTP, no delivery. Three wrong entries lock the attempt; support must resend/verify. */
  async deliver(driverId: string, orderId: string, otp: string, g: GeoStamp) {
    let o = await this.liveOrder(driverId, orderId);
    if (o.status === 'DELIVERED') return { delivered: true };
    if (o.status === 'OUT_FOR_DELIVERY') {
      await this.arrived(driverId, orderId, g);
      o = await this.liveOrder(driverId, orderId);
    }
    if (o.status !== 'ARRIVED') throw Errors.invalidTransition(o.status, 'DELIVERED');
    if (o.otpLocked) throw new AppError('OTP_LOCKED', 'Too many wrong OTPs. Call support to verify.', 423, 'CALL_SUPPORT');
    if (!o.otpEnc || !/^\d{4}$/.test(otp ?? '')) throw new AppError('OTP_REQUIRED', 'Enter the 4 digit OTP from the customer', 422);

    if (!safeEqual(decrypt(o.otpEnc), otp)) {
      const attempts = o.otpFailedAttempts + 1;
      const locked = attempts >= config.maxOtpAttempts;
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: o.id }, data: { otpFailedAttempts: attempts, otpLocked: locked } });
        await tx.otpEvent.create({ data: { orderId: o.id, kind: 'VERIFY_FAIL', actorType: 'DRIVER', actorId: driverId } });
        if (locked) {
          await tx.otpEvent.create({ data: { orderId: o.id, kind: 'LOCKED', actorType: 'SYSTEM' } });
          await tx.supportTicket.create({ data: { businessId: o.businessId, driverId, orderId: o.id, type: 'WHERE_IS_MY_PARCEL', priority: 'HIGH', subject: `OTP locked at door for ${o.code}` } });
        }
      });
      throw new AppError(locked ? 'OTP_LOCKED' : 'OTP_INVALID', locked ? 'Too many wrong OTPs. Call support to verify.' : `Wrong OTP. ${config.maxOtpAttempts - attempts} attempt(s) left.`, locked ? 423 : 422, locked ? 'CALL_SUPPORT' : 'RETRY');
    }

    const s = this.stamp(g);
    const flags: string[] = [];
    if (s.lat == null || s.lng == null) flags.push('DELIVERED_WITHOUT_GPS');
    else if (haversineKm(s.lat, s.lng, o.dropLat, o.dropLng) > ARRIVAL_RADIUS_KM) flags.push('DELIVERED_FAR_FROM_DROP');
    await this.prisma.$transaction(async (tx) => {
      await tx.otpEvent.create({ data: { orderId: o.id, kind: 'VERIFY_OK', actorType: 'DRIVER', actorId: driverId } });
      await this.state.transition(tx, o, 'DELIVERED', { type: 'DRIVER', id: driverId }, { ...s, data: flags.length ? { flags: { push: flags } } : {} });
      if (!o.isTest) await this.earn(tx, driverId, o.id, 'DELIVERY', o.deliveryFee, o.driverSharePct);
      await tx.driver.update({ where: { id: driverId }, data: { currentOrderId: null, availability: 'ONLINE', totalDeliveries: { increment: 1 }, lastDeliveryAt: new Date() } });
    });
    await this.events.emit(o.id, 'DELIVERED');
    return { delivered: true };
  }

  /** Customer not reachable / refused / no OTP … → Undelivered, return charge, return leg starts. */
  async undelivered(driverId: string, orderId: string, reason: UndeliveredReason, g: GeoStamp, note?: string) {
    const o = await this.liveOrder(driverId, orderId);
    if (['UNDELIVERED', 'RETURNING'].includes(o.status)) return this.currentJob(driverId);
    const rule = UNDELIVERED_REASONS[reason];
    if (!rule) throw new AppError('INVALID_REASON', `Reason must be one of ${Object.keys(UNDELIVERED_REASONS).join(', ')}`, 422);
    if (o.status === 'OUT_FOR_DELIVERY' && reason !== 'RIDER_COULD_NOT_FIND_LOCATION') {
      throw new AppError('ARRIVE_FIRST', 'Mark Arrived at the drop location first', 409, 'MARK_ARRIVED');
    }
    if (rule.needsWaitAndCalls) {
      const calls = await this.prisma.callLog.count({ where: { orderId, driverId, target: 'CUSTOMER' } });
      if (calls < config.minCallsBeforeUndelivered) {
        throw new AppError('CALLS_REQUIRED', `Call the customer at least ${config.minCallsBeforeUndelivered} times from the app first (${calls} so far)`, 409, 'CALL_CUSTOMER');
      }
      if (o.status === 'ARRIVED' && o.arrivedAt) {
        const waitEnds = o.arrivedAt.getTime() + config.arrivalWaitMinutes * 60_000;
        const at = Math.min(g.occurredAt ? new Date(g.occurredAt).getTime() || Date.now() : Date.now(), Date.now()); // never trust a future client clock
        if (at < waitEnds) {
          throw new AppError('WAIT_REQUIRED', `Please wait at the location until ${new Date(waitEnds).toISOString()}`, 409, 'WAIT', { waitEndsAt: new Date(waitEnds) });
        }
      }
    }
    const s = this.stamp(g);
    await this.prisma.$transaction(async (tx) => {
      const und = await this.state.transition(tx, o, 'UNDELIVERED', { type: 'DRIVER', id: driverId }, { ...s, reason: rule.label, note, data: { undeliveredReason: rule.label } });
      if (!o.isTest) await this.wallet.chargeReturn(tx, o.businessId, o.id, o.code, o.returnFee, rule.label);
      await this.state.transition(tx, und, 'RETURNING', { type: 'SYSTEM' }, { occurredAt: s.occurredAt });
    });
    await this.events.emit(o.id, 'UNDELIVERED');
    await this.events.emit(o.id, 'RETURNING');
    return this.currentJob(driverId);
  }

  /** Rider hands the parcel back; business gives the return code shown in their app. */
  async returnWithCode(driverId: string, orderId: string, code: string, g: GeoStamp) {
    const o = await this.liveOrder(driverId, orderId);
    if (o.status === 'RETURNED') return { returned: true };
    if (o.status !== 'RETURNING' || !o.returnOtpEnc) throw Errors.invalidTransition(o.status, 'RETURNED');
    if (!safeEqual(decrypt(o.returnOtpEnc), code ?? '')) throw new AppError('RETURN_CODE_INVALID', 'Wrong return code. Ask the business for the code shown in their app.', 422);
    await this.completeReturn(o.id, { type: 'DRIVER', id: driverId }, g);
    return { returned: true };
  }

  async completeReturn(orderId: string, actor: Actor, g: GeoStamp = {}) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status === 'RETURNED') return;
    if (o.status !== 'RETURNING') throw Errors.invalidTransition(o.status, 'RETURNED');
    const s = this.stamp(g);
    await this.prisma.$transaction(async (tx) => {
      await this.state.transition(tx, o, 'RETURNED', actor, s);
      if (o.driverId) {
        if (!o.isTest) {
          await this.earn(tx, o.driverId, o.id, 'DELIVERY', o.deliveryFee, o.driverSharePct);
          await this.earn(tx, o.driverId, o.id, 'RETURN', o.returnFee, o.driverSharePct);
        }
        await tx.driver.updateMany({ where: { id: o.driverId, currentOrderId: o.id }, data: { currentOrderId: null, availability: 'ONLINE', totalReturns: { increment: 1 }, lastDeliveryAt: new Date() } });
      }
    });
    await this.events.emit(o.id, 'RETURNED');
  }

  /** Driver earning for one leg. Unique per (order, leg): can never be paid twice. */
  private async earn(tx: Tx, driverId: string, orderId: string, leg: 'DELIVERY' | 'RETURN', fee: number, pct: number) {
    const { driver, platform } = splitFee(fee, pct);
    await tx.driverEarning.upsert({
      where: { orderId_leg: { orderId, leg } },
      create: { driverId, orderId, leg, grossFee: fee, amount: driver, platform },
      update: {},
    });
  }

  /** Support: unlock OTP after verifying the customer by phone, and resend. Logged. */
  async supportUnlockOtp(orderId: string, adminId: string) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!['OUT_FOR_DELIVERY', 'ARRIVED'].includes(o.status)) throw new AppError('NOT_AT_DOOR', 'OTP can be unlocked only while the rider is at the drop', 409);
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { otpLocked: false, otpFailedAttempts: 0 } });
      await tx.otpEvent.create({ data: { orderId, kind: 'UNLOCKED', actorType: 'SUPPORT', actorId: adminId } });
    });
    await this.resendOtp(orderId, { type: 'SUPPORT', id: adminId });
    return { ok: true };
  }

  async resendOtp(orderId: string, actor: Actor) {
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { business: { select: { name: true } } } });
    const live: OrderStatus[] = ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED'];
    if (!o.otpEnc || !live.includes(o.status)) throw new AppError('OTP_NOT_ACTIVE', 'OTP can be resent only for a live order', 409);
    if (o.otpSendCount >= 4 && actor.type !== 'SUPPORT') throw new AppError('OTP_RESEND_LIMIT', 'OTP was already resent. Contact support.', 429, 'CONTACT_SUPPORT');
    const otp = decrypt(o.otpEnc);
    await this.notify.sendSmsAndWhatsapp({
      to: o.customerPhone, template: 'CUSTOMER_OTP_RESEND', orderId, secret: otp,
      body: `OTP for your parcel from ${o.business.name}: ${otp}. Share only after you have the parcel.`,
    });
    await this.prisma.order.update({ where: { id: orderId }, data: { otpSendCount: { increment: 1 }, otpSentAt: new Date() } });
    await this.prisma.otpEvent.create({ data: { orderId, kind: 'RESENT', channel: 'SMS+WHATSAPP', actorType: actor.type, actorId: actor.id } });
    return { ok: true };
  }
}
