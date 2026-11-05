import { Body, Controller, createParamDecorator, ExecutionContext, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { OrderEventsService } from '../orders/order-events.service';
import { OrderStateService } from '../orders/order-state.service';
import { STATUS_LABEL, TRANSITIONS } from '../orders/order-status';
import { CancelDto, CreateOrderDto } from '../orders/orders.dto';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { ApiClient, ApiKeyGuard } from './api-key.guard';

const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ApiClient => ctx.switchToHttp().getRequest().apiClient);

class AdvanceDto { @IsOptional() @IsIn(['delivered', 'undelivered']) outcome?: 'delivered' | 'undelivered'; }

/** Strip fields the API never exposes (return code is for the business app only). */
function apiView<T extends { returnOtp?: unknown }>(v: T) {
  const { returnOtp: _r, ...rest } = v;
  return rest;
}

/**
 * Public whitelisted API, version 1. Frozen once live; breaking changes go to v2.
 * Test keys create sandbox orders: no real riders, no wallet movement.
 */
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private orders: OrdersService, private wallet: WalletService, private prisma: PrismaService, private state: OrderStateService, private events: OrderEventsService) {}

  @Get('statuses') statuses() {
    return Object.entries(STATUS_LABEL).map(([code, label]) => ({ code, label, next: TRANSITIONS[code as keyof typeof TRANSITIONS] }));
  }

  @Get('quote') quote(@Client() c: ApiClient) { return this.orders.quote(c.businessId); }
  @Get('wallet') wallet_(@Client() c: ApiClient) { return this.wallet.summary(c.businessId); }

  @Post('orders') async create(@Client() c: ApiClient, @Body() b: CreateOrderDto) {
    return apiView(await this.orders.create(c.businessId, b, { type: 'API', id: c.keyId }, { source: 'API', isTest: c.mode === 'TEST' }));
  }

  @Get('orders') async byReference(@Client() c: ApiClient, @Query('reference') reference?: string) {
    if (!reference) throw new AppError('REFERENCE_REQUIRED', 'Pass ?reference=<businessReferenceId> or use GET /v1/orders/:id', 422);
    const o = await this.prisma.order.findUnique({ where: { businessId_businessReferenceId: { businessId: c.businessId, businessReferenceId: reference } } });
    if (!o) throw Errors.notFound('Order');
    return apiView(await this.orders.get(c.businessId, o.id));
  }

  @Get('orders/:id') async get(@Client() c: ApiClient, @Param('id') id: string) {
    const [order, wallet] = await Promise.all([this.orders.get(c.businessId, id), this.wallet.summary(c.businessId)]);
    return { ...apiView(order), walletBalance: wallet.available };
  }

  @Post('orders/:id/ready') async ready(@Client() c: ApiClient, @Param('id') id: string) {
    return apiView(await this.orders.markReady(c.businessId, id, { type: 'API', id: c.keyId }));
  }

  @Post('orders/:id/cancel') async cancel(@Client() c: ApiClient, @Param('id') id: string, @Body() b: CancelDto) {
    return apiView(await this.orders.cancel(c.businessId, id, b.reason ?? 'BUSINESS_CANCELLED', { type: 'API', id: c.keyId }, b.note));
  }

  @Post('orders/:id/retry-assignment') async retry(@Client() c: ApiClient, @Param('id') id: string) {
    return apiView(await this.orders.retryAssignment(c.businessId, id, { type: 'API', id: c.keyId }));
  }

  /** Sandbox only: walk a test order through the full lifecycle with a simulated rider, firing real webhooks. */
  @Post('sandbox/orders/:id/advance') async advance(@Client() c: ApiClient, @Param('id') id: string, @Body() b: AdvanceDto) {
    if (c.mode !== 'TEST') throw new AppError('SANDBOX_ONLY', 'Use a TEST key for sandbox actions', 403);
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id }, { code: id }], businessId: c.businessId, isTest: true } });
    if (!o) throw Errors.notFound('Test order');
    const path: Record<string, string> = {
      CREATED: 'READY', READY: 'ASSIGNING', ASSIGNING: 'ASSIGNED', NO_RIDER: 'ASSIGNING', ASSIGNED: 'PICKED_UP', PICKED_UP: 'OUT_FOR_DELIVERY',
      OUT_FOR_DELIVERY: 'ARRIVED', ARRIVED: b.outcome === 'undelivered' ? 'UNDELIVERED' : 'DELIVERED', UNDELIVERED: 'RETURNING', RETURNING: 'RETURNED',
    };
    const to = path[o.status];
    if (!to) throw new AppError('SANDBOX_DONE', `Order is ${o.status}; nothing to advance`, 409);
    await this.prisma.$transaction((tx) =>
      this.state.transition(tx, o, to as never, { type: 'SYSTEM', id: 'sandbox' }, {
        reason: to === 'UNDELIVERED' ? 'Customer not reachable' : undefined,
        data: to === 'ASSIGNED' ? OrdersService.newOtps() : to === 'UNDELIVERED' ? { undeliveredReason: 'Customer not reachable' } : {},
      }),
    );
    await this.events.emit(o.id, to as never);
    return apiView(await this.orders.get(c.businessId, o.id));
  }
}
