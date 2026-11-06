import { Injectable } from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import { Tx } from '../common/prisma.service';
import { canTransition } from './order-status';

export interface Actor {
  type: 'BUSINESS' | 'DRIVER' | 'SYSTEM' | 'SUPPORT' | 'API';
  id?: string | null;
}

const TIMESTAMP_FIELD: Partial<Record<OrderStatus, keyof Order>> = {
  READY: 'readyAt',
  ASSIGNED: 'assignedAt',
  PICKED_UP: 'pickedUpAt',
  ARRIVED: 'arrivedAt',
  DELIVERED: 'deliveredAt',
  UNDELIVERED: 'undeliveredAt',
  RETURNED: 'returnedAt',
  CANCELLED: 'cancelledAt',
};

/**
 * The only place an order's status changes. Every change:
 *  - must be allowed by the state machine,
 *  - is guarded by an optimistic check on the current status (no lost updates under concurrency),
 *  - writes a timeline entry with actor, time, GPS and reason.
 */
@Injectable()
export class OrderStateService {
  async transition(
    tx: Tx,
    order: Pick<Order, 'id' | 'status'>,
    to: OrderStatus,
    actor: Actor,
    extra: { lat?: number | null; lng?: number | null; reason?: string | null; note?: string | null; occurredAt?: Date; data?: Prisma.OrderUncheckedUpdateInput } = {},
  ): Promise<Order> {
    if (!canTransition(order.status, to)) throw Errors.invalidTransition(order.status, to);
    const at = extra.occurredAt && extra.occurredAt <= new Date() ? extra.occurredAt : new Date();
    const tsField = TIMESTAMP_FIELD[to];
    const res = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { ...(extra.data as Prisma.OrderUncheckedUpdateManyInput), status: to, ...(tsField ? { [tsField]: at } : {}) },
    });
    if (res.count !== 1) {
      const cur = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
      throw Errors.invalidTransition(cur?.status ?? 'UNKNOWN', to);
    }
    await tx.orderTimeline.create({
      data: { orderId: order.id, status: to, actorType: actor.type, actorId: actor.id ?? null, lat: extra.lat ?? null, lng: extra.lng ?? null, reason: extra.reason ?? null, note: extra.note ?? null, occurredAt: at },
    });
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  }
}
