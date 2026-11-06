import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { AssignmentService } from '../assignment/assignment.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderEventsService } from '../orders/order-events.service';
import { OrderStateService } from '../orders/order-state.service';
import { WebhooksService } from '../webhooks/webhooks.service';

const DAY = 86_400_000;

/**
 * Background loops. Single-instance for the pilot; move to a queue (BullMQ/Redis) when running more than one API instance.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Jobs');
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private dispatch: AssignmentService,
    private webhooks: WebhooksService,
    private state: OrderStateService,
    private events: OrderEventsService,
    private notify: NotificationsService,
  ) {}

  onModuleInit() {
    if (config.schedulersDisabled) return;
    this.every('assignment', 5_000, () => this.dispatch.tick());
    this.every('webhooks', 10_000, () => this.webhooks.processDue());
    this.every('day-end', 15 * 60_000, () => this.autoCancelStaleReady());
    this.every('compliance', 60 * 60_000, () => this.documentCompliance());
    this.every('onboarding-reminders', 60 * 60_000, () => this.onboardingReminders());
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  private every(name: string, ms: number, fn: () => Promise<unknown>) {
    this.timers.push(
      setInterval(async () => {
        if (this.running.has(name)) return;
        this.running.add(name);
        try { await fn(); } catch (e) { this.log.error(`${name}: ${e}`); } finally { this.running.delete(name); }
      }, ms),
    );
  }

  /** At day end, unassigned Ready orders auto-cancel with no charge and a notification (masterplan §6). */
  async autoCancelStaleReady(now = new Date()) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const stale = await this.prisma.order.findMany({ where: { status: { in: ['READY', 'NO_RIDER'] }, readyAt: { lt: startOfDay } } });
    for (const o of stale) {
      try {
        await this.prisma.$transaction((tx) => this.state.transition(tx, o, 'CANCELLED', { type: 'SYSTEM' }, { reason: 'No rider available', note: 'Auto-cancelled at day end, no charge', data: { cancelReason: 'No rider available' } }));
        await this.events.emit(o.id, 'CANCELLED');
      } catch (e) {
        this.log.warn(`auto-cancel ${o.code}: ${e}`);
      }
    }
    return stale.length;
  }

  /** Expiry alerts at 30/15/7 days, auto-pause on expiry day (masterplan §8 step 6). */
  async documentCompliance(now = new Date()) {
    const drivers = await this.prisma.driver.findMany({ where: { status: 'APPROVED' } });
    let paused = 0;
    for (const d of drivers) {
      for (const [doc, exp] of [['Driving Licence', d.dlExpiry], ['RC', d.rcExpiry]] as const) {
        if (!exp) continue;
        const days = Math.floor((exp.getTime() - now.getTime()) / DAY);
        if (exp < now) {
          await this.prisma.driver.update({ where: { id: d.id }, data: { status: 'PAUSED', statusReason: `${doc} expired. Upload renewed document.`, ...(d.currentOrderId ? {} : { availability: 'OFFLINE' }) } });
          await this.notify.sendSmsAndWhatsapp({ to: d.phone, template: 'DRIVER_DOC_EXPIRED', body: `Your ${doc} has expired. You cannot accept jobs until you upload the renewed document in the app.` });
          paused++;
          break;
        }
        if ([30, 15, 7].includes(days)) {
          const template = `DRIVER_EXPIRY_${days}`;
          const sent = await this.prisma.notificationLog.count({ where: { to: d.phone, template, createdAt: { gt: new Date(now.getTime() - DAY) } } });
          if (!sent) await this.notify.send({ channel: 'SMS', to: d.phone, template, body: `Your ${doc} expires in ${days} days. Renew it and upload in the app to keep working.` });
        }
      }
    }
    return { paused };
  }

  /** Reminder at 24 h for onboarding links not yet used. */
  async onboardingReminders(now = new Date()) {
    const links = await this.prisma.onboardingLink.findMany({
      where: { usedAt: null, revokedAt: null, reminderSentAt: null, expiresAt: { gt: now }, createdAt: { lt: new Date(now.getTime() - DAY) } },
      include: { driver: true },
    });
    for (const l of links) {
      await this.notify.send({ channel: 'SMS', to: l.phone, template: 'DRIVER_ONBOARDING_REMINDER', body: `Reminder: your Quick Delivery partner signup link expires at ${l.expiresAt.toISOString()}. Complete it soon.` });
      await this.prisma.onboardingLink.update({ where: { id: l.id }, data: { reminderSentAt: now } });
    }
    return links.length;
  }
}
