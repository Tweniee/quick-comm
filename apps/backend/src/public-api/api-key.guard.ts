import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { safeEqual, sha256 } from '../common/crypto';
import { AppError } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

export interface ApiClient { businessId: string; keyId: string; mode: 'TEST' | 'LIVE' }

/** Simple fixed-window counters. Replace with Redis for multi-instance deployments. */
const windows = new Map<string, { minute: number; minuteCount: number; day: string; dayCount: number }>();

/**
 * Whitelisted API auth: X-API-Key (key id) + X-API-Secret, HTTPS only in production.
 * The business must be APPROVED and API-enabled by Super Admin; keys are revocable instantly.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      throw new AppError('HTTPS_REQUIRED', 'Use HTTPS', 403);
    }
    const keyId = req.headers['x-api-key'] as string | undefined;
    const secret = req.headers['x-api-secret'] as string | undefined;
    if (!keyId || !secret) throw new AppError('API_KEY_MISSING', 'Send X-API-Key and X-API-Secret headers', 401);
    const key = await this.prisma.apiKey.findUnique({ where: { keyId }, include: { business: true } });
    if (!key || !key.active || !safeEqual(key.secretHash, sha256(secret))) throw new AppError('API_KEY_INVALID', 'Invalid or revoked API key', 401);
    const b = key.business;
    if (b.status !== 'APPROVED') throw new AppError('BUSINESS_NOT_VERIFIED', 'Business is not approved', 403);
    if (!b.apiEnabled) throw new AppError('API_NOT_WHITELISTED', 'API access is not enabled for this business', 403);

    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    const day = now.toISOString().slice(0, 10);
    const w = windows.get(b.id) ?? { minute, minuteCount: 0, day, dayCount: 0 };
    if (w.minute !== minute) { w.minute = minute; w.minuteCount = 0; }
    if (w.day !== day) { w.day = day; w.dayCount = 0; }
    w.minuteCount++; w.dayCount++;
    windows.set(b.id, w);
    if (w.minuteCount > b.rateLimitPerMin || w.dayCount > b.rateLimitPerDay) {
      throw new AppError('RATE_LIMITED', `Rate limit exceeded (${b.rateLimitPerMin}/min, ${b.rateLimitPerDay}/day)`, 429, 'RETRY_LATER');
    }
    // lastUsedAt is best-effort; don't block the request on it.
    this.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } }).catch(() => undefined);
    req.apiClient = { businessId: b.id, keyId, mode: key.mode } as ApiClient;
    return true;
  }
}

export function resetRateLimits() { windows.clear(); }
