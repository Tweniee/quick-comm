import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';
import { resetRateLimits } from '../src/public-api/api-key.guard';

export const CENTER = { lat: 22.7196, lng: 75.8577 };
export const PICKUP = { lat: 22.7185, lng: 75.8571 };
export const DROP = { lat: 22.7400, lng: 75.8800 };

export interface Ctx {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  cityId: string;
  adminToken: string;
}

export async function bootstrap(): Promise<Ctx> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()), cityId: '', adminToken: '' };
}

export async function reset(ctx: Ctx) {
  resetRateLimits();
  const tables = await ctx.prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await ctx.prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
  const city = await ctx.prisma.city.create({ data: { name: 'Test City', centerLat: CENTER.lat, centerLng: CENTER.lng, radiusKm: 22.5 } });
  await ctx.prisma.pricingConfig.create({ data: { cityId: city.id, deliveryFee: 3500, returnFee: 2500, driverSharePct: 80, effectiveFrom: new Date('2020-01-01') } });
  await ctx.prisma.adminUser.create({ data: { name: 'Root', email: 'root@test.local', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash('pw', 4) } });
  ctx.cityId = city.id;
  const res = await ctx.http().post('/api/auth/admin/login').send({ email: 'root@test.local', password: 'pw' }).expect(201);
  ctx.adminToken = res.body.token;
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

let phoneSeq = 0;
export function nextPhone() {
  phoneSeq++;
  return `98${String(Date.now()).slice(-4)}${String(phoneSeq).padStart(4, '0')}`;
}

/** Signs up, approves and funds a business. Returns its token and id. */
export async function approvedBusiness(ctx: Ctx, rechargeRupees = 1000) {
  const phone = nextPhone();
  const signup = await ctx.http().post('/api/business/signup').send({
    cityId: ctx.cityId, name: 'Shop ' + phone, type: 'SOLE_PROPRIETORSHIP', ownerName: 'Owner', phone, email: `${phone}@shop.test`,
    password: 'password123', instagram: 'https://instagram.com/x', acceptTerms: true,
    pickup: { address: '1 Test Street', pincode: '452001', lat: PICKUP.lat, lng: PICKUP.lng },
  }).expect(201);
  const token = signup.body.token as string;
  const businessId = signup.body.business.id as string;
  await ctx.http().post(`/api/admin/businesses/${businessId}/review`).set(bearer(ctx.adminToken)).send({ action: 'APPROVE' }).expect(201);
  if (rechargeRupees > 0) {
    const r = await ctx.http().post('/api/business/wallet/recharges').set(bearer(token)).send({ amount: rechargeRupees * 100 }).expect(201);
    await ctx.http().post(`/api/business/wallet/recharges/${r.body.rechargeId}/mock-pay`).set(bearer(token)).expect(201);
  }
  return { token, businessId, phone };
}

/** Creates an APPROVED driver directly and logs them in, online at `loc`. */
export async function onlineDriver(ctx: Ctx, loc = { lat: PICKUP.lat + 0.001, lng: PICKUP.lng }) {
  const phone = `7${String(Date.now()).slice(-5)}${String(++phoneSeq).padStart(4, '0')}`;
  const year = new Date().getFullYear();
  const d = await ctx.prisma.driver.create({
    data: { cityId: ctx.cityId, name: `Rider ${phone}`, phone, status: 'APPROVED', dlExpiry: new Date(`${year + 5}-01-01`), rcExpiry: new Date(`${year + 5}-01-01`), vehicleNumber: 'MP09AB1234' },
  });
  const otp = await ctx.http().post('/api/auth/driver/request-otp').send({ phone }).expect(201);
  const login = await ctx.http().post('/api/auth/driver/verify-otp').send({ phone, code: otp.body.devOtp }).expect(201);
  const token = login.body.token as string;
  await ctx.http().post('/api/driver/availability').set(bearer(token)).send({ online: true, ...loc }).expect(201);
  return { token, driverId: d.id, phone };
}

export const orderBody = (over: Record<string, unknown> = {}) => ({
  customerName: 'Asha', customerPhone: '9123456789', dropAddress: '22 Lake View', dropLandmark: 'Near temple', dropPincode: '452010',
  dropLat: DROP.lat, dropLng: DROP.lng, parcelDescription: 'Cake box', weightGrams: 1500, declaredValue: 80000, ...over,
});
