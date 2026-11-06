import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { hmacSha256 } from '../src/common/crypto';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { JobsService } from '../src/jobs/jobs.service';
import { approvedBusiness, bearer, bootstrap, Ctx, onlineDriver, orderBody, reset } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await bootstrap(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await reset(ctx); });

async function apiKey(token: string, businessId: string, mode: 'TEST' | 'LIVE' = 'LIVE') {
  await ctx.http().post(`/api/admin/businesses/${businessId}/api-access`).set(bearer(ctx.adminToken)).send({ enabled: true }).expect(201);
  const k = await ctx.http().post('/api/business/api-keys').set(bearer(token)).send({ mode }).expect(201);
  return { 'X-API-Key': k.body.keyId, 'X-API-Secret': k.body.secret };
}

describe('whitelisted API v1', () => {
  it('requires whitelisting, is idempotent on businessReferenceId, never returns the OTP', async () => {
    const biz = await approvedBusiness(ctx);
    const noAccess = await ctx.http().post('/api/business/api-keys').set(bearer(biz.token)).send({ mode: 'LIVE' }).expect(403);
    expect(noAccess.body.error.code).toBe('API_NOT_WHITELISTED');
    const h = await apiKey(biz.token, biz.businessId);
    await ctx.http().get('/api/v1/quote').expect(401);
    await ctx.http().get('/api/v1/quote').set({ ...h, 'X-API-Secret': 'wrong' }).expect(401);

    const body = orderBody({ businessReferenceId: 'WOO-1001' });
    const [a, b] = await Promise.all([
      ctx.http().post('/api/v1/orders').set(h).send(body),
      ctx.http().post('/api/v1/orders').set(h).send(body),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await ctx.prisma.order.count({ where: { businessId: biz.businessId } })).toBe(1);
    expect(a.body.returnOtp).toBeUndefined();

    const byRef = await ctx.http().get('/api/v1/orders?reference=WOO-1001').set(h).expect(200);
    expect(byRef.body.code).toBe(a.body.code);

    // Revocation is immediate.
    const keys = await ctx.http().get('/api/business/api-keys').set(bearer(biz.token)).expect(200);
    await ctx.http().delete(`/api/business/api-keys/${keys.body[0].id}`).set(bearer(biz.token)).expect(200);
    await ctx.http().get('/api/v1/quote').set(h).expect(401);
  });

  it('rate limits per business', async () => {
    const biz = await approvedBusiness(ctx);
    const h = await apiKey(biz.token, biz.businessId);
    await ctx.prisma.business.update({ where: { id: biz.businessId }, data: { rateLimitPerMin: 3 } });
    for (let i = 0; i < 3; i++) await ctx.http().get('/api/v1/quote').set(h).expect(200);
    const r = await ctx.http().get('/api/v1/quote').set(h).expect(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  it('sandbox: test key walks an order end to end, no wallet movement, signed webhooks delivered', async () => {
    const received: { headers: IncomingMessage['headers']; body: string }[] = [];
    const server: Server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => { received.push({ headers: req.headers, body: data }); res.end('ok'); });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as AddressInfo).port;
    try {
      const biz = await approvedBusiness(ctx);
      const h = await apiKey(biz.token, biz.businessId, 'TEST');
      // HTTPS is required for webhook URLs; set a local http URL directly for the test receiver.
      await ctx.http().post('/api/business/webhook').set(bearer(biz.token)).send({ url: 'http://insecure.example' }).expect(422);
      const wh = await ctx.http().post('/api/business/webhook').set(bearer(biz.token)).send({ url: 'https://example.invalid/hook' }).expect(201);
      await ctx.prisma.business.update({ where: { id: biz.businessId }, data: { webhookUrl: `http://127.0.0.1:${port}/hook` } });

      const o = await ctx.http().post('/api/v1/orders').set(h).send(orderBody()).expect(201);
      expect(o.body.isTest).toBe(true);
      let status = o.body.status;
      for (let i = 0; i < 10 && status !== 'DELIVERED'; i++) {
        status = (await ctx.http().post(`/api/v1/sandbox/orders/${o.body.id}/advance`).set(h).send({}).expect(201)).body.status;
      }
      expect(status).toBe('DELIVERED');
      expect(await ctx.prisma.walletLedger.count({ where: { orderId: o.body.id } })).toBe(0);

      await ctx.app.get(WebhooksService).processDue();
      const events = received.map((r) => r.headers['x-qd-event']);
      expect(events).toEqual(expect.arrayContaining(['order.created', 'order.ready', 'order.assigned', 'order.picked_up', 'order.delivered']));
      for (const r of received) {
        expect(r.headers['x-qd-signature']).toBe(hmacSha256(wh.body.webhookSecret, `${r.headers['x-qd-timestamp']}.${r.body}`));
        expect(r.body).not.toMatch(/"otp":"\d{4}"/);
      }
    } finally {
      server.close();
    }
  });

  it('LIVE key cannot use the sandbox', async () => {
    const biz = await approvedBusiness(ctx);
    const h = await apiKey(biz.token, biz.businessId, 'LIVE');
    const o = await ctx.http().post('/api/v1/orders').set(h).send(orderBody()).expect(201);
    await ctx.http().post(`/api/v1/sandbox/orders/${o.body.id}/advance`).set(h).send({}).expect(403);
  });
});

describe('driver onboarding link', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const form = {
    name: 'Suresh Yadav', dob: '1994-02-03', address: 'Vijay Nagar', emergencyContact: '9000011111',
    dlNumber: 'MP0920180012345', dlExpiry: `${new Date().getFullYear() + 4}-05-01`, rcNumber: 'MP09CD5678', rcExpiry: `${new Date().getFullYear() + 2}-05-01`,
    vehicleNumber: 'MP09CD5678', vehicleType: 'BIKE', bikeModel: 'Honda Shine', aadhaarNumber: '345678901234',
    bankAccountNumber: '123456789012', ifsc: 'HDFC0001234', accountHolderName: 'Suresh Yadav',
  };
  const docs = ['DL_FRONT', 'DL_BACK', 'RC_FRONT', 'RC_BACK', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'BANK_PROOF', 'SELFIE', 'BIKE_PHOTO'];

  function submit(token: string, f: Record<string, string> = form) {
    let req = ctx.http().post(`/api/onboarding/${token}`);
    for (const [k, v] of Object.entries(f)) req = req.field(k, v);
    for (const d of docs) req = req.attach(d, png, { filename: `${d}.png`, contentType: 'image/png' });
    return req;
  }

  it('single use, replaced by a newer link, checks DL validity, human approval required', async () => {
    const inv = await ctx.http().post('/api/admin/drivers/invite').set(bearer(ctx.adminToken)).send({ name: 'Suresh', phone: '9811122233', cityId: ctx.cityId, source: 'ZOMATO' }).expect(201);
    const token1 = inv.body.onboardingUrl.split('/onboard/')[1];
    await ctx.http().get(`/api/onboarding/${token1}`).expect(200);

    const resend = await ctx.http().post(`/api/admin/drivers/${inv.body.driver.id}/send-link`).set(bearer(ctx.adminToken)).expect(201);
    const token2 = resend.body.onboardingUrl.split('/onboard/')[1];
    expect((await ctx.http().get(`/api/onboarding/${token1}`).expect(410)).body.error.code).toBe('LINK_REPLACED');

    const expiring = await submit(token2, { ...form, dlExpiry: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) }).expect(422);
    expect(expiring.body.error.message).toContain('Driving Licence');

    await submit(token2).expect(201);
    expect((await ctx.http().get(`/api/onboarding/${token2}`).expect(410)).body.error.code).toBe('LINK_USED');

    // Not active until approved: cannot log in.
    await ctx.http().post('/api/auth/driver/request-otp').send({ phone: '9811122233' }).expect(403);
    const detail = await ctx.http().get(`/api/admin/drivers/${inv.body.driver.id}`).set(bearer(ctx.adminToken)).expect(200);
    expect(detail.body.checks).toMatchObject({ ageOk: true, dlValid30Days: true, allDocsUploaded: true, noDuplicates: true, bankNameMatches: true });
    expect(JSON.stringify(detail.body)).not.toContain('345678901234');
    expect(JSON.stringify(detail.body)).not.toContain('123456789012');
    const url = await ctx.http().get(`/api/admin/documents/${detail.body.documents[0].id}/url`).set(bearer(ctx.adminToken)).expect(200);
    await ctx.http().get(`/api${url.body.url}`).expect(200);
    await ctx.http().get(`/api${url.body.url.replace(/sig=[0-9a-f]+/, 'sig=00')}`).expect(403);

    await ctx.http().post(`/api/admin/drivers/${inv.body.driver.id}/review`).set(bearer(ctx.adminToken)).send({ action: 'APPROVE' }).expect(201);
    await ctx.http().post('/api/auth/driver/request-otp').send({ phone: '9811122233' }).expect(201);
  });

  it('expired link cannot be used', async () => {
    const inv = await ctx.http().post('/api/admin/drivers/invite').set(bearer(ctx.adminToken)).send({ name: 'A', phone: '9811122299', cityId: ctx.cityId }).expect(201);
    await ctx.prisma.onboardingLink.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const token = inv.body.onboardingUrl.split('/onboard/')[1];
    expect((await ctx.http().get(`/api/onboarding/${token}`).expect(410)).body.error.code).toBe('LINK_EXPIRED');
  });
});

describe('compliance jobs and payouts', () => {
  it('auto-pauses riders with expired DL', async () => {
    const r = await onlineDriver(ctx);
    await ctx.prisma.driver.update({ where: { id: r.driverId }, data: { dlExpiry: new Date(Date.now() - 86_400_000) } });
    await ctx.app.get(JobsService).documentCompliance();
    const d = await ctx.prisma.driver.findUniqueOrThrow({ where: { id: r.driverId } });
    expect(d.status).toBe('PAUSED');
    expect(d.availability).toBe('OFFLINE');
  });

  it('30 days without a delivery: rider must check in before going online again', async () => {
    const r = await onlineDriver(ctx);
    await ctx.http().post('/api/driver/availability').set(bearer(r.token)).send({ online: false }).expect(201);
    await ctx.prisma.driver.update({ where: { id: r.driverId }, data: { approvedAt: new Date(Date.now() - 31 * 86_400_000), lastDeliveryAt: null } });
    const blocked = await ctx.http().post('/api/driver/availability').set(bearer(r.token)).send({ online: true }).expect(403);
    expect(blocked.body.error.code).toBe('CHECK_IN_REQUIRED');
    let d = await ctx.prisma.driver.findUniqueOrThrow({ where: { id: r.driverId } });
    expect(d.status).toBe('PAUSED');
    expect(await ctx.prisma.supportTicket.count({ where: { driverId: r.driverId, subject: { contains: 'check-in' } } })).toBe(1);
    // Support checks in and re-checks documents → Reactivate; the rider can go online again.
    await ctx.http().post(`/api/admin/drivers/${r.driverId}/review`).set(bearer(ctx.adminToken)).send({ action: 'REACTIVATE' }).expect(201);
    await ctx.http().post('/api/driver/availability').set(bearer(r.token)).send({ online: true }).expect(201);
    d = await ctx.prisma.driver.findUniqueOrThrow({ where: { id: r.driverId } });
    expect(d.lastCheckInAt).not.toBeNull();

    // The background job pauses inactive riders who are offline too, but never one on a live order.
    const r2 = await onlineDriver(ctx);
    await ctx.prisma.driver.update({ where: { id: r2.driverId }, data: { approvedAt: new Date(Date.now() - 40 * 86_400_000), lastDeliveryAt: new Date(Date.now() - 35 * 86_400_000) } });
    expect((await ctx.app.get(JobsService).inactiveRiders()).paused).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.driver.findUniqueOrThrow({ where: { id: r2.driverId } })).status).toBe('PAUSED');
  });

  it('weekly payout bundles unpaid earnings exactly once', async () => {
    const r = await onlineDriver(ctx);
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);
    await ctx.prisma.driverEarning.createMany({ data: [
      { driverId: r.driverId, orderId: 'o1', leg: 'DELIVERY', grossFee: 3500, amount: 2800, platform: 700, createdAt: lastWeek },
      { driverId: r.driverId, orderId: 'o2', leg: 'DELIVERY', grossFee: 3500, amount: 2800, platform: 700, createdAt: lastWeek },
      { driverId: r.driverId, orderId: 'o2', leg: 'RETURN', grossFee: 2500, amount: 2000, platform: 500, createdAt: lastWeek },
    ] });
    const svc = ctx.app.get(PayoutsService);
    await svc.generate(lastWeek.toISOString(), 'admin');
    await svc.generate(lastWeek.toISOString(), 'admin');
    const payouts = await ctx.prisma.driverPayout.findMany({ where: { driverId: r.driverId } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ grossPay: 7600, deliveryCount: 2, returnCount: 1, status: 'PENDING' });
  });
});
