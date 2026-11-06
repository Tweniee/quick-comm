import { Controller, Get, Module, Param } from '@nestjs/common';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { presentForTracking } from '../orders/order-presenter';

/** Customer tracking: link only, no login (masterplan §4.5). The unguessable token is the access control. */
@Controller('track')
export class TrackingController {
  constructor(private prisma: PrismaService) {}

  @Get(':token')
  async get(@Param('token') token: string) {
    const o = await this.prisma.order.findUnique({ where: { trackingToken: token }, include: { driver: true, business: { select: { name: true, phone: true } } } });
    if (!o) throw Errors.notFound('Tracking link');
    const view = presentForTracking(o);
    const calls = view.returnInfo ? await this.prisma.callLog.count({ where: { orderId: o.id, target: 'CUSTOMER' } }) : 0;
    return view.returnInfo ? { ...view, returnInfo: { ...view.returnInfo, calls } } : view;
  }
}

@Module({ controllers: [TrackingController] })
export class TrackingModule {}
