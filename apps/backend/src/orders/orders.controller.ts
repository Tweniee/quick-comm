import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import { Errors } from '../common/errors';
import { CancelDto, CreateOrderDto, EditOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('business/orders')
@Auth('business')
export class BusinessOrdersController {
  constructor(private orders: OrdersService, private prisma: PrismaService) {}

  @Get('quote') quote(@CurrentUser() u: Principal) { return this.orders.quote(u.businessId!); }
  @Get('today') today(@CurrentUser() u: Principal) { return this.orders.todayCounts(u.businessId!); }
  @Get() list(@CurrentUser() u: Principal, @Query() q: Record<string, string>) {
    return this.orders.list(u.businessId!, { ...q, take: q.take ? Number(q.take) : undefined, skip: q.skip ? Number(q.skip) : undefined });
  }
  @Post() create(@CurrentUser() u: Principal, @Body() b: CreateOrderDto) {
    return this.orders.create(u.businessId!, b, { type: 'BUSINESS', id: u.sub }, { source: 'APP' });
  }
  @Get(':id') get(@CurrentUser() u: Principal, @Param('id') id: string) { return this.orders.get(u.businessId!, id); }
  @Patch(':id') edit(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: EditOrderDto) { return this.orders.edit(u.businessId!, id, b); }
  @Post(':id/ready') ready(@CurrentUser() u: Principal, @Param('id') id: string) { return this.orders.markReady(u.businessId!, id, { type: 'BUSINESS', id: u.sub }); }
  @Post(':id/retry-assignment') retry(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.orders.retryAssignment(u.businessId!, id, { type: 'BUSINESS', id: u.sub });
  }
  @Post(':id/cancel') cancel(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: CancelDto) {
    return this.orders.cancel(u.businessId!, id, b.reason ?? 'BUSINESS_CANCELLED', { type: 'BUSINESS', id: u.sub }, b.note);
  }
  /** After assignment the business cannot cancel directly — it asks support (masterplan §6). */
  @Post(':id/request-cancellation') async requestCancel(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: CancelDto) {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }], businessId: u.businessId } });
    if (!o) throw Errors.notFound('Order');
    return this.prisma.supportTicket.create({
      data: { businessId: u.businessId, orderId: o.id, type: 'BUSINESS_ISSUE', priority: 'HIGH', subject: `Cancellation requested for ${o.code}`, messages: { create: { authorType: 'BUSINESS', authorId: u.sub, body: b.note || 'Please cancel this order' } } },
    });
  }
  @Post(':id/confirm-return') confirmReturn(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.orders.confirmReturnReceived(u.businessId!, id, { type: 'BUSINESS', id: u.sub });
  }
}
