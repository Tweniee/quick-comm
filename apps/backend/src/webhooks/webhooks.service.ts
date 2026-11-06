import { Injectable, Logger } from '@nestjs/common';
import { hmacSha256 } from '../common/crypto';
import { PrismaService } from '../common/prisma.service';

const BACKOFF_SECONDS = [0, 30, 120, 600]; // first try + 3 retries

/**
 * Signed, retried webhooks (masterplan §12).
 * Signature: X-QD-Signature = hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`)), X-QD-Timestamp = unix seconds.
 * After 3 failed retries the delivery is FAILED and shows in Admin → Webhooks for manual retry.
 */
@Injectable()
export class WebhooksService {
  private log = new Logger('Webhooks');
  constructor(private prisma: PrismaService) {}

  async enqueue(businessId: string, orderId: string, event: string, payload: object) {
    const b = await this.prisma.business.findUnique({ where: { id: businessId }, select: { webhookUrl: true } });
    if (!b?.webhookUrl) return null;
    return this.prisma.webhookDelivery.create({ data: { businessId, orderId, event, url: b.webhookUrl, payload } });
  }

  async processDue(limit = 50) {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
    });
    for (const d of due) await this.attempt(d.id);
    return due.length;
  }

  async attempt(id: string) {
    const d = await this.prisma.webhookDelivery.findUnique({ where: { id } });
    if (!d || d.status === 'DELIVERED') return d;
    const b = await this.prisma.business.findUnique({ where: { id: d.businessId }, select: { webhookSecret: true } });
    const body = JSON.stringify(d.payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = hmacSha256(b?.webhookSecret || '', `${ts}.${body}`);
    let ok = false;
    let err: string | null = null;
    try {
      const res = await fetch(d.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-QD-Event': d.event, 'X-QD-Timestamp': ts, 'X-QD-Signature': sig, 'X-QD-Delivery': d.id },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      ok = res.ok;
      if (!ok) err = `HTTP ${res.status}`;
    } catch (e) {
      err = String(e);
    }
    const attempts = d.attempts + 1;
    if (ok) {
      return this.prisma.webhookDelivery.update({ where: { id }, data: { attempts, status: 'DELIVERED', deliveredAt: new Date(), lastError: null } });
    }
    const exhausted = attempts >= BACKOFF_SECONDS.length;
    if (exhausted) this.log.warn(`Webhook ${id} failed after ${attempts} attempts: ${err}`);
    return this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts,
        lastError: err,
        status: exhausted ? 'FAILED' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + (BACKOFF_SECONDS[attempts] ?? 0) * 1000),
      },
    });
  }

  /** Admin manual retry of a FAILED delivery. */
  async retry(id: string) {
    await this.prisma.webhookDelivery.update({ where: { id }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() } });
    return this.attempt(id);
  }

  listFailed() {
    return this.prisma.webhookDelivery.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
