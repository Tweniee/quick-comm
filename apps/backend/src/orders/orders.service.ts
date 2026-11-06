import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { CitiesService } from '../cities/cities.service';
import { config } from '../common/config';
import { encrypt, numericCode, orderCode, randomToken } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { insideCircle } from '../common/geo';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { AssignmentService } from '../assignment/assignment.service';
import { WalletService } from '../wallet/wallet.service';
import { OrderEventsService } from './order-events.service';
import { presentForBusiness } from './order-presenter';
import { Actor, OrderStateService } from './order-state.service';
import { BUSINESS_CANCELLABLE, CANCEL_REASONS, CancelReason, EDITABLE } from './order-status';

export interface CreateOrderInput {
  businessReferenceId?: string;
  pickupAddressId?: string;
  customerName: string;
  customerPhone: string;
  dropAddress: string;
  dropLandmark?: string;
  dropPincode?: string;
  dropLat: number;
  dropLng: number;
  parcelDescription: string;
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValue: number; // paise
  isFragile?: boolean;
  specialInstructions?: string;
  markReady?: boolean;
}

export const ORDER_INCLUDE = {
  pickupAddress: true,
  driver: true,
  timeline: { orderBy: { occurredAt: 'asc' as const } },
  business: { select: { name: true, phone: true } },
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private cities: CitiesService,
    private wallet: WalletService,
    private state: OrderStateService,
    private events: OrderEventsService,
    @Inject(forwardRef(() => AssignmentService)) private assignment: AssignmentService,
  ) {}

  /** Fee quote shown before the business presses Create (masterplan §4.1). */
  async quote(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const p = await this.cities.activePricing(b.cityId);
    const available = b.walletBalance - b.walletHeld;
    return {
      deliveryFee: p.deliveryFee,
      returnFee: p.returnFee,
      undeliveredTotal: p.deliveryFee + p.returnFee,
      walletAvailable: available,
      requiredAvailable: p.deliveryFee + p.returnFee,
      canCreate: available >= p.deliveryFee + p.returnFee && b.status === 'APPROVED',
      message: available >= p.deliveryFee + p.returnFee ? null : `Recharge ₹${Math.ceil((p.deliveryFee + p.returnFee - available) / 100)} to create this order`,
      liabilityCap: config.liabilityCapPaise,
      note: 'No time promise. Inside the city deliveries usually take 30 to 70 minutes from Ready.',
    };
  }

  validateParcel(i: Pick<CreateOrderInput, 'weightGrams' | 'lengthCm' | 'widthCm' | 'heightCm'>) {
    if (!Number.isInteger(i.weightGrams) || i.weightGrams <= 0) throw new AppError('INVALID_WEIGHT', 'Enter the parcel weight', 422);
    if (i.weightGrams > config.maxWeightGrams) throw Errors.overweight();
    const { l, w, h, sum } = config.maxDims;
    if (i.lengthCm && i.widthCm && i.heightCm) {
      const dims = [i.lengthCm, i.widthCm, i.heightCm].sort((a, b) => b - a);
      const box = [l, w, h].sort((a, b) => b - a);
      const fits = dims.every((d, idx) => d <= box[idx]);
      if (!fits && dims[0] + dims[1] + dims[2] > sum) throw Errors.oversize();
      if (!fits) throw Errors.oversize();
    }
  }

  async create(businessId: string, input: CreateOrderInput, actor: Actor, opts: { source?: 'APP' | 'API'; isTest?: boolean } = {}) {
    // Idempotency: same business reference → same order, never a second deduction.
    if (input.businessReferenceId) {
      const existing = await this.prisma.order.findUnique({
        where: { businessId_businessReferenceId: { businessId, businessReferenceId: input.businessReferenceId } },
        include: ORDER_INCLUDE,
      });
      if (existing) return { ...presentForBusiness(existing), idempotentReplay: true };
    }

    const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { city: true } });
    if (b.status !== 'APPROVED') throw Errors.businessNotVerified();
    if (b.city.status === 'PAUSED') throw Errors.cityPaused(b.city.pauseMessage);

    const phone = normalizePhone(input.customerPhone);
    if (!phone) throw Errors.invalidPhone();
    if (!input.customerName?.trim()) throw new AppError('CUSTOMER_NAME_REQUIRED', 'Enter the customer name', 422);
    if (!input.dropAddress?.trim()) throw new AppError('ADDRESS_REQUIRED', 'Enter the delivery address', 422);
    if (!input.parcelDescription?.trim()) throw new AppError('DESCRIPTION_REQUIRED', 'Describe the parcel', 422);
    this.validateParcel(input);
    if (!Number.isInteger(input.declaredValue) || input.declaredValue < 0) throw new AppError('INVALID_VALUE', 'Enter the parcel value', 422);

    const pickup = input.pickupAddressId
      ? await this.prisma.pickupAddress.findFirst({ where: { id: input.pickupAddressId, businessId, active: true } })
      : await this.prisma.pickupAddress.findFirst({ where: { businessId, active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (!pickup) throw new AppError('PICKUP_NOT_FOUND', 'Choose a valid pickup address', 422, 'ADD_PICKUP_ADDRESS');
    if (!insideCircle(pickup.lat, pickup.lng, b.city)) throw Errors.outsideServiceArea('pickup');
    if (!insideCircle(input.dropLat, input.dropLng, b.city)) throw Errors.outsideServiceArea('drop');

    const pricing = await this.cities.activePricing(b.cityId);
    const available = b.walletBalance - b.walletHeld;
    if (!opts.isTest && available < pricing.deliveryFee + pricing.returnFee) throw Errors.insufficientWallet(pricing.deliveryFee + pricing.returnFee, available);

    const warnings: string[] = [];
    if (input.declaredValue > config.liabilityCapPaise) {
      warnings.push('Platform liability is capped at ₹5,000 (lower of order value or ₹5,000). Use your own insurance for more cover.');
    }

    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            code: orderCode(),
            businessId,
            cityId: b.cityId,
            pickupAddressId: pickup.id,
            businessReferenceId: input.businessReferenceId,
            source: opts.source ?? 'APP',
            isTest: !!opts.isTest,
            customerName: input.customerName.trim(),
            customerPhone: phone,
            dropAddress: input.dropAddress.trim(),
            dropLandmark: input.dropLandmark,
            dropPincode: input.dropPincode,
            dropLat: input.dropLat,
            dropLng: input.dropLng,
            parcelDescription: input.parcelDescription.trim(),
            weightGrams: input.weightGrams,
            lengthCm: input.lengthCm,
            widthCm: input.widthCm,
            heightCm: input.heightCm,
            declaredValue: input.declaredValue,
            isFragile: !!input.isFragile,
            specialInstructions: input.specialInstructions,
            deliveryFee: pricing.deliveryFee,
            returnFee: pricing.returnFee,
            driverSharePct: pricing.driverSharePct,
            trackingToken: randomToken(18),
            timeline: { create: { status: 'CREATED', actorType: actor.type, actorId: actor.id ?? null } },
          },
        });
        return o;
      });
    } catch (e) {
      // Concurrent duplicate with the same businessReferenceId: return the winner.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.businessReferenceId) {
        const existing = await this.prisma.order.findUniqueOrThrow({
          where: { businessId_businessReferenceId: { businessId, businessReferenceId: input.businessReferenceId } },
          include: ORDER_INCLUDE,
        });
        return { ...presentForBusiness(existing), idempotentReplay: true };
      }
      throw e;
    }
    await this.events.emit(order.id, 'CREATED');
    if (input.markReady) return { ...(await this.markReady(businessId, order.id, actor)), warnings };
    return { ...(await this.get(businessId, order.id)), warnings };
  }

  async get(businessId: string | null, id: string) {
    const o = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { code: id }], ...(businessId ? { businessId } : {}) },
      include: ORDER_INCLUDE,
    });
    if (!o) throw Errors.notFound('Order');
    return presentForBusiness(o, { includeReturnOtp: !!businessId });
  }

  async list(businessId: string, q: { status?: string; search?: string; from?: string; to?: string; take?: number; skip?: number }) {
    const where: Prisma.OrderWhereInput = { businessId };
    if (q.status) where.status = { in: q.status.split(',') as OrderStatus[] };
    if (q.search) where.OR = [{ code: { contains: q.search, mode: 'insensitive' } }, { customerPhone: { contains: q.search } }, { customerName: { contains: q.search, mode: 'insensitive' } }, { businessReferenceId: q.search }];
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: { pickupAddress: true, driver: true }, orderBy: { createdAt: 'desc' }, take: Math.min(q.take ?? 50, 200), skip: q.skip ?? 0 }),
      this.prisma.order.count({ where }),
    ]);
    return { total, items: items.map((o) => presentForBusiness(o)) };
  }

  /** Today's counts for the Business App home. */
  async todayCounts(businessId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await this.prisma.order.groupBy({ by: ['status'], where: { businessId, createdAt: { gte: start } }, _count: true });
    return Object.fromEntries(rows.map((r) => [r.status, r._count]));
  }

  async edit(businessId: string, id: string, input: Partial<CreateOrderInput>) {
    const o = await this.prisma.order.findFirst({ where: { id, businessId }, include: { city: true } });
    if (!o) throw Errors.notFound('Order');
    if (!EDITABLE.includes(o.status)) throw new AppError('NOT_EDITABLE', 'Order can be edited only before a rider is assigned', 409);
    const data: Prisma.OrderUpdateInput = {};
    if (input.customerName) data.customerName = input.customerName.trim();
    if (input.customerPhone) {
      const p = normalizePhone(input.customerPhone);
      if (!p) throw Errors.invalidPhone();
      data.customerPhone = p;
    }
    if (input.dropLat !== undefined && input.dropLng !== undefined) {
      if (!insideCircle(input.dropLat, input.dropLng, o.city)) throw Errors.outsideServiceArea('drop');
      data.dropLat = input.dropLat;
      data.dropLng = input.dropLng;
    }
    if (input.weightGrams !== undefined || input.lengthCm !== undefined) {
      this.validateParcel({ weightGrams: input.weightGrams ?? o.weightGrams, lengthCm: input.lengthCm ?? o.lengthCm ?? undefined, widthCm: input.widthCm ?? o.widthCm ?? undefined, heightCm: input.heightCm ?? o.heightCm ?? undefined });
    }
    for (const k of ['dropAddress', 'dropLandmark', 'dropPincode', 'parcelDescription', 'weightGrams', 'lengthCm', 'widthCm', 'heightCm', 'declaredValue', 'isFragile', 'specialInstructions'] as const) {
      if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
    }
    if (input.pickupAddressId) {
      const pickup = await this.prisma.pickupAddress.findFirst({ where: { id: input.pickupAddressId, businessId, active: true } });
      if (!pickup) throw new AppError('PICKUP_NOT_FOUND', 'Choose a valid pickup address', 422);
      data.pickupAddress = { connect: { id: pickup.id } };
    }
    await this.prisma.order.update({ where: { id }, data });
    return this.get(businessId, id);
  }

  /** Business marks the parcel packed and sealed. Assignment starts only now (masterplan rule: never before Ready). */
  async markReady(businessId: string, id: string, actor: Actor) {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }], businessId }, include: { business: true, city: true } });
    if (!o) throw Errors.notFound('Order');
    if (o.status !== 'CREATED') throw Errors.invalidTransition(o.status, 'READY');
    if (o.city.status === 'PAUSED') throw Errors.cityPaused(o.city.pauseMessage);
    if (!o.isTest) {
      const available = o.business.walletBalance - o.business.walletHeld;
      if (available < o.deliveryFee + o.returnFee) throw Errors.insufficientWallet(o.deliveryFee + o.returnFee, available);
    }
    await this.prisma.$transaction((tx) => this.state.transition(tx, o, 'READY', actor));
    await this.events.emit(o.id, 'READY');
    if (!o.isTest) await this.assignment.start(o.id, actor);
    return this.get(businessId, o.id);
  }

  /** "No rider available" → business may retry (one manual retry; support can do more). */
  async retryAssignment(businessId: string, id: string, actor: Actor) {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }], businessId } });
    if (!o) throw Errors.notFound('Order');
    if (o.status !== 'NO_RIDER') throw new AppError('NOT_RETRYABLE', 'Retry is available only when no rider was found', 409);
    if (o.assignmentAttempts > config.maxManualAssignmentRetries) {
      throw new AppError('RETRY_LIMIT', 'Retry limit reached. Contact support or cancel the order with no charge.', 409, 'CONTACT_SUPPORT');
    }
    await this.assignment.start(o.id, actor);
    return this.get(businessId, o.id);
  }

  async cancel(businessId: string | null, id: string, reason: CancelReason, actor: Actor, note?: string) {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }], ...(businessId ? { businessId } : {}) } });
    if (!o) throw Errors.notFound('Order');
    const allowed = actor.type === 'SUPPORT' ? ['CREATED', 'READY', 'ASSIGNING', 'NO_RIDER', 'ASSIGNED'] : BUSINESS_CANCELLABLE;
    if (!allowed.includes(o.status)) {
      if (o.status === 'ASSIGNED') {
        throw new AppError('CANCEL_NEEDS_SUPPORT', 'A rider is already assigned. Request cancellation from support.', 409, 'REQUEST_CANCELLATION');
      }
      throw new AppError('NOT_CANCELLABLE', 'The parcel is already with the rider. It can only be delivered or returned.', 409);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.assignmentOffer.updateMany({ where: { orderId: o.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      if (o.status === 'ASSIGNED') {
        await this.wallet.release(tx, o.businessId, o.id, o.code, 'cancelled before pickup');
        if (o.driverId) await tx.driver.updateMany({ where: { id: o.driverId, currentOrderId: o.id }, data: { currentOrderId: null, availability: 'ONLINE' } });
      }
      await this.state.transition(tx, o, 'CANCELLED', actor, { reason: CANCEL_REASONS[reason] ?? reason, note, data: { cancelReason: CANCEL_REASONS[reason] ?? reason } });
    });
    await this.events.emit(o.id, 'CANCELLED');
    return this.get(businessId, o.id);
  }

  /** Business confirms the returned parcel is back (alternative to the rider entering the return code). */
  async confirmReturnReceived(businessId: string, id: string, actor: Actor) {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }], businessId } });
    if (!o) throw Errors.notFound('Order');
    await this.assignment.completeReturn(o.id, actor);
    return this.get(businessId, o.id);
  }

  /** Generates the 4-digit delivery OTP and the business-facing return code at assignment. */
  static newOtps() {
    return { otpEnc: encrypt(numericCode(4)), returnOtpEnc: encrypt(numericCode(4)) };
  }
}
