import { Global, Module } from '@nestjs/common';
import { AssignmentService } from '../assignment/assignment.service';
import { OrderEventsService } from './order-events.service';
import { OrderStateService } from './order-state.service';
import { BusinessOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Global()
@Module({
  controllers: [BusinessOrdersController],
  providers: [OrdersService, OrderStateService, OrderEventsService, AssignmentService],
  exports: [OrdersService, OrderStateService, OrderEventsService, AssignmentService],
})
export class OrdersModule {}
