import { Injectable } from '@nestjs/common';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

export const TICKET_TYPES = ['WHERE_IS_MY_PARCEL', 'WALLET_DISPUTE', 'RIDER_ISSUE', 'BUSINESS_ISSUE', 'LOSS_DAMAGE', 'SUSPICIOUS_PARCEL', 'OTHER'];

export const CANNED_REPLIES: Record<string, string> = {
  WHERE_IS_MY_PARCEL: 'We checked the live timeline and the rider location. We have called the rider and will update you shortly.',
  WALLET_DISPUTE: 'Here is the breakdown from your passbook: forward ₹35, return ₹25 when undelivered. We have attached the wait timer, call log and OTP attempts for this order.',
  NO_RIDER: 'We are sorry, no rider was available in your area at that moment. Please retry in 10 minutes. There is no charge for this.',
  LOSS_DAMAGE: 'Please share the invoice, parcel value proof and packing photo. We investigate within 2 business days.',
};

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async create(input: { businessId?: string; driverId?: string; orderId?: string; type: string; subject: string; body: string; priority?: string }, author: { type: string; id: string }) {
    if (!TICKET_TYPES.includes(input.type)) throw new AppError('INVALID_TYPE', `Type must be one of ${TICKET_TYPES.join(', ')}`, 422);
    let orderId = input.orderId;
    if (orderId) {
      const o = await this.prisma.order.findFirst({ where: { OR: [{ id: orderId }, { code: orderId }], ...(input.businessId ? { businessId: input.businessId } : {}) } });
      if (!o) throw Errors.notFound('Order');
      orderId = o.id;
      // Loss/damage claims must be raised within 24 h of the expected delivery (masterplan §9).
      if (input.type === 'LOSS_DAMAGE' && author.type === 'BUSINESS') {
        const ref = o.deliveredAt ?? o.returnedAt ?? o.updatedAt;
        if (Date.now() - ref.getTime() > 24 * 3_600_000) throw new AppError('CLAIM_WINDOW_CLOSED', 'Loss or damage claims must be raised within 24 hours', 409);
      }
    }
    return this.prisma.supportTicket.create({
      data: {
        businessId: input.businessId, driverId: input.driverId, orderId, type: input.type, subject: input.subject,
        priority: input.priority ?? (input.type === 'LOSS_DAMAGE' ? 'HIGH' : 'NORMAL'),
        messages: { create: { authorType: author.type, authorId: author.id, body: input.body } },
      },
      include: { messages: true },
    });
  }

  list(where: { businessId?: string; status?: string; type?: string; assignedToAdminId?: string }) {
    return this.prisma.supportTicket.findMany({
      where: { ...(where.businessId ? { businessId: where.businessId } : {}), ...(where.status ? { status: { in: where.status.split(',') } } : {}), ...(where.type ? { type: where.type } : {}), ...(where.assignedToAdminId ? { assignedToAdminId: where.assignedToAdminId } : {}) },
      include: { business: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async get(id: string, businessId?: string) {
    const t = await this.prisma.supportTicket.findFirst({ where: { id, ...(businessId ? { businessId } : {}) }, include: { messages: { orderBy: { createdAt: 'asc' } }, business: { select: { name: true, phone: true, ownerName: true } } } });
    if (!t) throw Errors.notFound('Ticket');
    return t;
  }

  async reply(id: string, body: string, author: { type: string; id: string }, businessId?: string) {
    const t = await this.get(id, businessId);
    if (!body?.trim()) throw new AppError('EMPTY_MESSAGE', 'Write a message', 422);
    await this.prisma.ticketMessage.create({ data: { ticketId: t.id, authorType: author.type, authorId: author.id, body } });
    if (author.type === 'ADMIN' && t.status === 'OPEN') await this.prisma.supportTicket.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    if (author.type === 'BUSINESS' && t.status === 'RESOLVED') await this.prisma.supportTicket.update({ where: { id }, data: { status: 'OPEN', resolvedAt: null } });
    return this.get(id, businessId);
  }

  async update(id: string, data: { status?: string; priority?: string; assignedToAdminId?: string; resolution?: string }) {
    if (data.status === 'RESOLVED' && !data.resolution) throw new AppError('RESOLUTION_REQUIRED', 'Write the resolution', 422);
    return this.prisma.supportTicket.update({ where: { id }, data: { ...data, resolvedAt: data.status === 'RESOLVED' ? new Date() : undefined } });
  }
}
