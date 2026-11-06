import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { AppError, Errors } from '../common/errors';
import { PrismaService, Tx } from '../common/prisma.service';

export interface PricingInput {
  deliveryFee: number; // paise
  returnFee: number; // paise
  driverSharePct?: number;
  minRechargeAmount?: number;
  maxRechargeAmount?: number;
  lowBalanceWarnAt?: number;
  effectiveFrom?: string;
}

@Injectable()
export class CitiesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const c = await this.prisma.city.findUnique({ where: { id } });
    if (!c) throw Errors.notFound('City');
    return c;
  }

  /** Price in force at `at`. Prices never change for orders already created: orders snapshot the fee. */
  async activePricing(cityId: string, at = new Date(), tx?: Tx) {
    const db = tx ?? this.prisma;
    const p = await db.pricingConfig.findFirst({
      where: { cityId, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!p) throw new AppError('PRICING_NOT_SET', 'Pricing is not configured for this city yet', 409, 'CONTACT_SUPPORT');
    return p;
  }

  async create(data: { name: string; centerLat: number; centerLng: number; radiusKm?: number; opensAt?: string; closesAt?: string }, adminId: string) {
    const city = await this.prisma.city.create({ data });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'CITY_CREATE', entity: 'City', entityId: city.id, newValue: city });
    return city;
  }

  async update(id: string, data: Partial<{ name: string; centerLat: number; centerLng: number; radiusKm: number; opensAt: string; closesAt: string }>, adminId: string, reason?: string) {
    const old = await this.get(id);
    if (data.radiusKm !== undefined && (data.radiusKm <= 0 || data.radiusKm > 25)) {
      throw new AppError('INVALID_RADIUS', 'Radius must be between 0 and 25 km (40-45 km diameter service area)', 422);
    }
    const city = await this.prisma.city.update({ where: { id }, data });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'CITY_UPDATE', entity: 'City', entityId: id, oldValue: old, newValue: city, reason });
    return city;
  }

  async setPaused(id: string, paused: boolean, message: string | undefined, adminId: string) {
    const old = await this.get(id);
    const city = await this.prisma.city.update({
      where: { id },
      data: { status: paused ? 'PAUSED' : 'ACTIVE', pauseMessage: paused ? message || 'Deliveries paused in your city' : null },
    });
    await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: paused ? 'CITY_PAUSE' : 'CITY_RESUME', entity: 'City', entityId: id, oldValue: { status: old.status }, newValue: { status: city.status }, reason: message });
    return city;
  }

  pricingHistory(cityId: string) {
    return this.prisma.pricingConfig.findMany({ where: { cityId }, orderBy: { effectiveFrom: 'desc' } });
  }

  /** New price version. Closes the previous open-ended version at the new effective time. */
  async setPricing(cityId: string, input: PricingInput, adminId: string) {
    await this.get(cityId);
    if (input.deliveryFee <= 0 || input.returnFee < 0) throw new AppError('INVALID_PRICE', 'Fees must be positive', 422);
    const pct = input.driverSharePct ?? 80;
    if (pct < 0 || pct > 100) throw new AppError('INVALID_SHARE', 'Driver share must be 0-100%', 422);
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.pricingConfig.updateMany({ where: { cityId, effectiveTo: null, effectiveFrom: { lt: effectiveFrom } }, data: { effectiveTo: effectiveFrom } });
      const p = await tx.pricingConfig.create({
        data: {
          cityId,
          deliveryFee: input.deliveryFee,
          returnFee: input.returnFee,
          driverSharePct: pct,
          minRechargeAmount: input.minRechargeAmount ?? 50000,
          maxRechargeAmount: input.maxRechargeAmount ?? 5000000,
          lowBalanceWarnAt: input.lowBalanceWarnAt ?? 20000,
          effectiveFrom,
          setByAdminId: adminId,
        },
      });
      await this.audit.log({ actorType: 'ADMIN', actorId: adminId, action: 'PRICING_SET', entity: 'City', entityId: cityId, newValue: p }, tx);
      return p;
    });
  }
}
