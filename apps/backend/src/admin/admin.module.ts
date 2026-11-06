import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { DriversModule } from '../drivers/drivers.module';
import { PayoutsService } from '../payouts/payouts.service';
import { BusinessTicketsController } from '../support/support.controller';
import { SupportService } from '../support/support.service';
import { AdminBusinessService } from './admin-business.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [BusinessesModule, DriversModule],
  controllers: [AdminController, BusinessTicketsController],
  providers: [AdminService, AdminBusinessService, SupportService, PayoutsService],
})
export class AdminModule {}
