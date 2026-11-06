import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { decrypt } from '../common/crypto';
import { rupees } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebhooksService } from '../webhooks/webhooks.service';
import { presentForBusiness, presentForTracking, trackingUrl } from './order-presenter';
import { STATUS_LABEL } from './order-status';

/** Fan-out after a committed state change: webhooks, realtime, notifications. Never throws into the caller. */
@Injectable()
export class OrderEventsService {
  private log = new Logger('OrderEvents');
  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
    private realtime: RealtimeGateway,
    private notify: NotificationsService,
  ) {}

  async emit(orderId: string, status: OrderStatus, extra: { note?: string } = {}) {
    try {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { pickupAddress: true, driver: true, business: { select: { name: true, phone: true } } },
      });
      if (!o) return;
      const view = presentForBusiness(o);
      const { returnOtp: _omit, ...apiView } = view;
      await this.webhooks.enqueue(o.businessId, o.id, `order.${status.toLowerCase()}`, {
        event: `order.${status.toLowerCase()}`,
        status,
        statusLabel: STATUS_LABEL[status],
        occurredAt: new Date().toISOString(),
        order: apiView,
      });
      this.realtime.emit(`business:${o.businessId}`, 'order.updated', view);
      this.realtime.emit('admin', 'order.updated', { id: o.id, code: o.code, status });
      this.realtime.emit(`track:${o.trackingToken}`, 'tracking.updated', presentForTracking(o));
      if (o.driverId) this.realtime.emit(`driver:${o.driverId}`, 'order.updated', { id: o.id, status });

      // Business notifications (Appendix B). Push/SMS provider decides delivery; all are logged.
      const biz = o.business!;
      const msg: Partial<Record<OrderStatus, string>> = {
        READY: `Order ${o.code} is Ready, looking for a rider.`,
        ASSIGNED: `Rider ${o.driver?.name.split(' ')[0] ?? ''} assigned to ${o.code}, pickup in progress.`,
        DELIVERED: `${o.code} delivered, OTP confirmed, ${rupees(o.deliveryFee)} deducted.`,
        RETURNING: `${o.code}: ${o.undeliveredReason ?? 'Customer not reachable'}, returning parcel, ${rupees(o.returnFee)} return deducted, total ${rupees(o.deliveryFee + o.returnFee)}.`,
        NO_RIDER: `No rider available at this moment for ${o.code}. Please retry in 10 minutes.`,
      };
      if (msg[status]) await this.notify.send({ channel: 'PUSH', to: `business:${o.businessId}`, template: `BUSINESS_${status}`, body: msg[status]!, orderId: o.id });

      // Customer: OTP + tracking link at assignment and again at pickup (assumption A3).
      if ((status === 'ASSIGNED' || status === 'PICKED_UP') && o.otpEnc) {
        const otp = decrypt(o.otpEnc);
        await this.notify.sendSmsAndWhatsapp({
          to: o.customerPhone,
          template: status === 'ASSIGNED' ? 'CUSTOMER_TRACKING' : 'CUSTOMER_PICKED_UP',
          body: `Your parcel from ${biz.name} is on the way. Track here: ${trackingUrl(o.trackingToken)}. OTP: ${otp}. Share OTP only after you have the parcel.`,
          secret: otp,
          orderId: o.id,
        });
        await this.prisma.order.update({ where: { id: o.id }, data: { otpSentAt: new Date(), otpSendCount: { increment: 1 } } });
        await this.prisma.otpEvent.create({ data: { orderId: o.id, kind: status === 'ASSIGNED' ? 'SENT' : 'RESENT', channel: 'SMS+WHATSAPP', actorType: 'SYSTEM' } });
      }
    } catch (e) {
      this.log.error(`emit ${status} for ${orderId} failed: ${e}`);
    }
  }
}
