import { Controller, Get, Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CitiesModule } from './cities/cities.module';
import { AuditModule } from './common/audit.service';
import { PrismaModule, PrismaService } from './common/prisma.service';
import { DocumentsModule } from './documents/documents.module';
import { DriversModule } from './drivers/drivers.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.service';
import { OrdersModule } from './orders/orders.module';
import { PublicApiModule } from './public-api/public-api.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TrackingModule } from './tracking/tracking.controller';
import { WalletModule } from './wallet/wallet.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}
  @Get() async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date() };
  }
}

@Module({
  imports: [
    PrismaModule, AuditModule, NotificationsModule, RealtimeModule, WebhooksModule, DocumentsModule,
    AuthModule, CitiesModule, WalletModule, OrdersModule, BusinessesModule, DriversModule,
    TrackingModule, PublicApiModule, AdminModule, JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
