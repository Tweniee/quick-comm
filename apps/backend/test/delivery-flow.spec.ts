import { decrypt } from '../src/common/crypto';
import { AssignmentService } from '../src/assignment/assignment.service';
import { approvedBusiness, bearer, bootstrap, Ctx, DROP, onlineDriver, orderBody, reset } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await bootstrap(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await reset(ctx); });

async function wallet(token: string) {
  return (await ctx.http().get('/api/business/wallet').set(bearer(token)).expect(200)).body;
}

async function readyOrderWithRider(over: Record<string, unknown> = {}) {
  const biz = await approvedBusiness(ctx);
  const rider = await onlineDriver(ctx);
  const created = await ctx.http().post('/api/business/orders').set(bearer(biz.token)).send(orderBody(over)).expect(201);
  const ready = await ctx.http().post(`/api/business/orders/${created.body.id}/ready`).set(bearer(biz.token)).expect(201);
  expect(ready.body.status).toBe('ASSIGNING');
  const feed = await ctx.http().get('/api/driver/feed').set(bearer(rider.token)).expect(200);
  expect(feed.body.offer).toBeTruthy();
  expect(feed.body.offer.earning).toBe(2800);
  return { biz, rider, orderId: created.body.id as string, offerId: feed.body.offer.offerId as string };
}

describe('happy path: create → ready → assign → pickup → OTP → delivered', () => {
  it('charges exactly ₹35, pays rider ₹28, never exposes the OTP to the business', async () => {
    const { biz, rider, orderId, offerId } = await readyOrderWithRider();
    expect((await wallet(biz.token)).available).toBe(100000);

    const job = await ctx.http().post(`/api/driver/offers/${offerId}/accept`).set(bearer(rider.token)).expect(201);
    expect(job.body.status).toBe('ASSIGNED');
    let w = await wallet(biz.token);
    expect(w.balance).toBe(100000);
    expect(w.held).toBe(3500);

    // Business view: OTP status only, never the value.
    const view = await ctx.http().get(`/api/business/orders/${orderId}`).set(bearer(biz.token)).expect(200);
    expect(view.body.otp.status).toBe('SENT');
    const raw = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const otp = decrypt(raw.otpEnc!);
    expect(JSON.stringify(view.body)).not.toContain(`"${otp}"`);
    // Customer tracking shows it.
    const track = await ctx.http().get(`/api/track/${raw.trackingToken}`).expect(200);
    expect(track.body.otp).toBe(otp);
    // Notification log stores masked OTP.
    const logs = await ctx.prisma.notificationLog.findMany({ where: { orderId } });
    expect(logs.some((l) => l.body.includes(otp))).toBe(false);

    // Cannot deliver before pickup.
    await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp }).expect(409);

    await ctx.http().post(`/api/driver/orders/${orderId}/pickup`).set(bearer(rider.token)).send({ lat: 22.7185, lng: 75.8571 }).expect(201);
    w = await wallet(biz.token);
    expect(w.balance).toBe(96500);
    expect(w.held).toBe(0);

    // Pickup replay (offline queue) must not double charge.
    await ctx.http().post(`/api/driver/orders/${orderId}/pickup`).set(bearer(rider.token)).send({}).expect(201);
    expect((await wallet(biz.token)).balance).toBe(96500);

    await ctx.http().post(`/api/driver/orders/${orderId}/arrived`).set(bearer(rider.token)).send(DROP).expect(201);
    const wrong = otp === '0000' ? '1111' : '0000';
    const bad = await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp: wrong, ...DROP }).expect(422);
    expect(bad.body.error.code).toBe('OTP_INVALID');
    await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp, ...DROP }).expect(201);

    const done = await ctx.http().get(`/api/business/orders/${orderId}`).set(bearer(biz.token)).expect(200);
    expect(done.body.status).toBe('DELIVERED');
    expect(done.body.timeline.map((t: { status: string }) => t.status)).toEqual(['CREATED', 'READY', 'ASSIGNING', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED']);
    expect((await wallet(biz.token)).balance).toBe(96500);

    const earnings = await ctx.prisma.driverEarning.findMany({ where: { orderId } });
    expect(earnings).toEqual([expect.objectContaining({ leg: 'DELIVERY', amount: 2800, platform: 700 })]);
    const d = await ctx.prisma.driver.findUniqueOrThrow({ where: { id: rider.driverId } });
    expect(d.currentOrderId).toBeNull();
    expect(d.availability).toBe('ONLINE');

    // Delivered is terminal.
    await ctx.http().post(`/api/business/orders/${orderId}/cancel`).set(bearer(biz.token)).send({}).expect(409);
  });

  it('locks the OTP after 3 wrong attempts and raises a support ticket', async () => {
    const { rider, orderId, offerId } = await readyOrderWithRider();
    await ctx.http().post(`/api/driver/offers/${offerId}/accept`).set(bearer(rider.token)).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/pickup`).set(bearer(rider.token)).send({}).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/arrived`).set(bearer(rider.token)).send(DROP).expect(201);
    const otp = decrypt((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).otpEnc!);
    const wrong = otp === '9999' ? '8888' : '9999';
    await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp: wrong }).expect(422);
    await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp: wrong }).expect(422);
    const third = await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp: wrong }).expect(423);
    expect(third.body.error.code).toBe('OTP_LOCKED');
    // Even the right OTP is refused while locked.
    await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp }).expect(423);
    expect(await ctx.prisma.supportTicket.count({ where: { orderId } })).toBe(1);
    await ctx.http().post(`/api/admin/orders/${orderId}/unlock-otp`).set(bearer(ctx.adminToken)).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/deliver`).set(bearer(rider.token)).send({ otp }).expect(201);
  });
});

describe('undelivered → return: ₹60 total, rider ₹48', () => {
  it('requires calls and the wait timer, then charges return and completes with the return code', async () => {
    const { biz, rider, orderId, offerId } = await readyOrderWithRider();
    await ctx.http().post(`/api/driver/offers/${offerId}/accept`).set(bearer(rider.token)).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/pickup`).set(bearer(rider.token)).send({}).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/arrived`).set(bearer(rider.token)).send(DROP).expect(201);

    const noCalls = await ctx.http().post(`/api/driver/orders/${orderId}/undelivered`).set(bearer(rider.token)).send({ reason: 'CUSTOMER_NOT_REACHABLE' }).expect(409);
    expect(noCalls.body.error.code).toBe('CALLS_REQUIRED');
    await ctx.http().post(`/api/driver/orders/${orderId}/calls`).set(bearer(rider.token)).send({ target: 'CUSTOMER', outcome: 'NO_ANSWER' }).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/calls`).set(bearer(rider.token)).send({ target: 'CUSTOMER', outcome: 'NO_ANSWER' }).expect(201);
    const early = await ctx.http().post(`/api/driver/orders/${orderId}/undelivered`).set(bearer(rider.token)).send({ reason: 'CUSTOMER_NOT_REACHABLE' }).expect(409);
    expect(early.body.error.code).toBe('WAIT_REQUIRED');
    // A future client clock must not bypass the wait.
    const future = await ctx.http().post(`/api/driver/orders/${orderId}/undelivered`).set(bearer(rider.token)).send({ reason: 'CUSTOMER_NOT_REACHABLE', occurredAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(409);
    expect(future.body.error.code).toBe('WAIT_REQUIRED');

    await ctx.prisma.order.update({ where: { id: orderId }, data: { arrivedAt: new Date(Date.now() - 16 * 60_000) } });
    const und = await ctx.http().post(`/api/driver/orders/${orderId}/undelivered`).set(bearer(rider.token)).send({ reason: 'CUSTOMER_NOT_REACHABLE', ...DROP }).expect(201);
    expect(und.body.status).toBe('RETURNING');
    expect((await wallet(biz.token)).balance).toBe(100000 - 6000);

    const bizView = await ctx.http().get(`/api/business/orders/${orderId}`).set(bearer(biz.token)).expect(200);
    expect(bizView.body.returnOtp).toMatch(/^\d{4}$/);
    await ctx.http().post(`/api/driver/orders/${orderId}/returned`).set(bearer(rider.token)).send({ code: bizView.body.returnOtp === '0000' ? '1111' : '0000' }).expect(422);
    await ctx.http().post(`/api/driver/orders/${orderId}/returned`).set(bearer(rider.token)).send({ code: bizView.body.returnOtp }).expect(201);

    const earnings = await ctx.prisma.driverEarning.findMany({ where: { orderId } });
    expect(earnings.reduce((s, e) => s + e.amount, 0)).toBe(4800);
    expect(earnings.reduce((s, e) => s + e.platform, 0)).toBe(1200);
    const ledger = await ctx.prisma.walletLedger.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((l) => [l.type, l.amount])).toEqual([['HOLD', 3500], ['FORWARD_CHARGE', 3500], ['RETURN_CHARGE', 2500]]);
    expect((await ctx.http().get(`/api/business/orders/${orderId}`).set(bearer(biz.token))).body.status).toBe('RETURNED');
  });

  it('allows "OTP not provided" without waiting', async () => {
    const { rider, orderId, offerId } = await readyOrderWithRider();
    await ctx.http().post(`/api/driver/offers/${offerId}/accept`).set(bearer(rider.token)).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/pickup`).set(bearer(rider.token)).send({}).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/arrived`).set(bearer(rider.token)).send(DROP).expect(201);
    await ctx.http().post(`/api/driver/orders/${orderId}/undelivered`).set(bearer(rider.token)).send({ reason: 'OTP_NOT_PROVIDED' }).expect(201);
  });
});

describe('assignment', () => {
  it('honest NO_RIDER with no charge; one manual retry only', async () => {
    const biz = await approvedBusiness(ctx);
    const o = await ctx.http().post('/api/business/orders').set(bearer(biz.token)).send(orderBody({ markReady: true })).expect(201);
    expect(o.body.status).toBe('NO_RIDER');
    expect((await wallet(biz.token)).balance).toBe(100000);
    const r1 = await ctx.http().post(`/api/business/orders/${o.body.id}/retry-assignment`).set(bearer(biz.token)).expect(201);
    expect(r1.body.status).toBe('NO_RIDER');
    const r2 = await ctx.http().post(`/api/business/orders/${o.body.id}/retry-assignment`).set(bearer(biz.token)).expect(409);
    expect(r2.body.error.code).toBe('RETRY_LIMIT');
    await ctx.http().post(`/api/business/orders/${o.body.id}/cancel`).set(bearer(biz.token)).send({}).expect(201);
    expect(await ctx.prisma.walletLedger.count({ where: { orderId: o.body.id } })).toBe(0);
  });

  it('offers nearest rider first, moves to the next on decline and on timeout', async () => {
    const biz = await approvedBusiness(ctx);
    const near = await onlineDriver(ctx, { lat: 22.7186, lng: 75.8572 });
    const mid = await onlineDriver(ctx, { lat: 22.73, lng: 75.86 });
    const far = await onlineDriver(ctx, { lat: 22.76, lng: 75.88 });
    const o = await ctx.http().post('/api/business/orders').set(bearer(biz.token)).send(orderBody({ markReady: true })).expect(201);

    const f1 = await ctx.http().get('/api/driver/feed').set(bearer(near.token)).expect(200);
    expect(f1.body.offer).toBeTruthy();
    expect((await ctx.http().get('/api/driver/feed').set(bearer(mid.token))).body.offer).toBeNull();
    await ctx.http().post(`/api/driver/offers/${f1.body.offer.offerId}/decline`).set(bearer(near.token)).expect(201);

    const f2 = await ctx.http().get('/api/driver/feed').set(bearer(mid.token)).expect(200);
    expect(f2.body.offer).toBeTruthy();
    await ctx.prisma.assignmentOffer.updateMany({ where: { id: f2.body.offer.offerId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await ctx.app.get(AssignmentService).tick();
    await ctx.http().post(`/api/driver/offers/${f2.body.offer.offerId}/accept`).set(bearer(mid.token)).expect(409);

    const f3 = await ctx.http().get('/api/driver/feed').set(bearer(far.token)).expect(200);
    expect(f3.body.offer).toBeTruthy();
    await ctx.http().post(`/api/driver/offers/${f3.body.offer.offerId}/accept`).set(bearer(far.token)).expect(201);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.body.id } })).driverId).toBe(far.driverId);
  });

  it('one order per rider: a busy rider gets no new offers', async () => {
    const { biz, rider, offerId } = await readyOrderWithRider();
    await ctx.http().post(`/api/driver/offers/${offerId}/accept`).set(bearer(rider.token)).expect(201);
    const o2 = await ctx.http().post('/api/business/orders').set(bearer(biz.token)).send(orderBody({ markReady: true })).expect(201);
    expect(o2.body.status).toBe('NO_RIDER');
  });

  it('cancel: business blocked after assignment, support cancel releases the hold', async () => {
    const { biz, rider, orderId, offerId } = await readyOrderWithRider();
    await ctx.http().post(`/api/driver/offers/${offerId}/accept`).set(bearer(rider.token)).expect(201);
    const r = await ctx.http().post(`/api/business/orders/${orderId}/cancel`).set(bearer(biz.token)).send({}).expect(409);
    expect(r.body.error.code).toBe('CANCEL_NEEDS_SUPPORT');
    await ctx.http().post(`/api/admin/orders/${orderId}/cancel`).set(bearer(ctx.adminToken)).send({ reason: 'SUPPORT_CANCELLED' }).expect(201);
    const w = await wallet(biz.token);
    expect(w.held).toBe(0);
    expect(w.balance).toBe(100000);
    expect((await ctx.prisma.driver.findUniqueOrThrow({ where: { id: rider.driverId } })).currentOrderId).toBeNull();
  });
});

describe('order creation rules', () => {
  it('blocks unverified, insufficient wallet, out of area, overweight, invalid phone', async () => {
    const funded = await approvedBusiness(ctx);
    const poor = await approvedBusiness(ctx, 0);
    const insufficient = await ctx.http().post('/api/business/orders').set(bearer(poor.token)).send(orderBody()).expect(402);
    expect(insufficient.body.error).toMatchObject({ code: 'INSUFFICIENT_WALLET', nextAction: 'RECHARGE' });
    expect((await ctx.http().post('/api/business/orders').set(bearer(funded.token)).send(orderBody({ dropLat: 23.5, dropLng: 77.4 })).expect(422)).body.error.code).toBe('OUTSIDE_SERVICE_AREA');
    expect((await ctx.http().post('/api/business/orders').set(bearer(funded.token)).send(orderBody({ weightGrams: 20001 })).expect(422)).body.error.code).toBe('OVERWEIGHT');
    expect((await ctx.http().post('/api/business/orders').set(bearer(funded.token)).send(orderBody({ lengthCm: 80, widthCm: 30, heightCm: 30 })).expect(422)).body.error.code).toBe('OVERSIZE');
    expect((await ctx.http().post('/api/business/orders').set(bearer(funded.token)).send(orderBody({ customerPhone: '12345' })).expect(422)).body.error.code).toBe('INVALID_PHONE');
    const big = await ctx.http().post('/api/business/orders').set(bearer(funded.token)).send(orderBody({ declaredValue: 900000 })).expect(201);
    expect(big.body.warnings[0]).toContain('₹5,000');
  });

  it('pending business cannot create orders or recharge', async () => {
    const res = await ctx.http().post('/api/business/signup').send({
      cityId: ctx.cityId, name: 'New', type: 'INDIVIDUAL', ownerName: 'Xavier', phone: '9000000001', email: 'n@x.test', password: 'password123', acceptTerms: true,
      pickup: { address: '1 Street', pincode: '452001', lat: 22.72, lng: 75.86 },
    }).expect(201);
    expect((await ctx.http().post('/api/business/orders').set(bearer(res.body.token)).send(orderBody()).expect(403)).body.error.code).toBe('BUSINESS_NOT_VERIFIED');
    expect((await ctx.http().post('/api/business/wallet/recharges').set(bearer(res.body.token)).send({ amount: 50000 }).expect(403)).body.error.code).toBe('RECHARGE_BLOCKED');
    const b = await ctx.prisma.business.findUniqueOrThrow({ where: { id: res.body.business.id } });
    expect(b.flaggedForReview).toBe(true); // no public presence given
  });

  it('price changes never affect orders already created', async () => {
    const biz = await approvedBusiness(ctx);
    const o = await ctx.http().post('/api/business/orders').set(bearer(biz.token)).send(orderBody()).expect(201);
    await ctx.http().post(`/api/admin/cities/${ctx.cityId}/pricing`).set(bearer(ctx.adminToken)).send({ deliveryFee: 4000, returnFee: 3000 }).expect(201);
    expect((await ctx.http().get(`/api/business/orders/${o.body.id}`).set(bearer(biz.token))).body.fees.delivery).toBe(3500);
    const o2 = await ctx.http().post('/api/business/orders').set(bearer(biz.token)).send(orderBody()).expect(201);
    expect(o2.body.fees.delivery).toBe(4000);
  });
});
