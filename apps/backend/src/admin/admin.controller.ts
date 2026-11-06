import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { AssignmentService } from '../assignment/assignment.service';
import { BusinessesService } from '../businesses/businesses.service';
import { DocumentsService } from '../documents/documents.service';
import { DriversService } from '../drivers/drivers.service';
import { OnboardingService } from '../drivers/onboarding.service';
import { CANCEL_REASONS } from '../orders/order-status';
import { OrdersService } from '../orders/orders.service';
import { PayoutsService } from '../payouts/payouts.service';
import { CANNED_REPLIES, SupportService } from '../support/support.service';
import { WalletService } from '../wallet/wallet.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AdminBusinessService } from './admin-business.service';
import { AdminService } from './admin.service';

class ReasonDto { @IsOptional() @IsString() reason?: string; }
class BusinessReviewDto extends ReasonDto { @IsIn(['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE']) action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REACTIVATE'; }
class DriverReviewDto extends ReasonDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_REUPLOAD', 'SUSPEND', 'BLOCK', 'PAUSE', 'REACTIVATE']) action: 'APPROVE' | 'REJECT' | 'REQUEST_REUPLOAD' | 'SUSPEND' | 'BLOCK' | 'PAUSE' | 'REACTIVATE';
  @IsOptional() @IsString() dlExpiry?: string;
  @IsOptional() @IsString() rcExpiry?: string;
}
class ApiAccessDto { @IsBoolean() enabled: boolean; @IsOptional() @IsInt() rateLimitPerMin?: number; @IsOptional() @IsInt() rateLimitPerDay?: number; }
class WalletAdjustDto { @IsIn(['CREDIT', 'DEBIT_ADJUSTMENT', 'REFUND']) kind: 'CREDIT' | 'DEBIT_ADJUSTMENT' | 'REFUND'; @Type(() => Number) @IsInt() @Min(1) amount: number; @IsString() reason: string; @IsOptional() @IsString() orderId?: string; }
class InviteDto { @IsString() name: string; @IsString() phone: string; @IsString() cityId: string; @IsOptional() @IsString() source?: string; }
class CancelDto { @IsOptional() @IsIn(Object.keys(CANCEL_REASONS)) reason?: keyof typeof CANCEL_REASONS; @IsOptional() @IsString() note?: string; }
class TicketUpdateDto { @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED']) status?: string; @IsOptional() @IsString() priority?: string; @IsOptional() @IsString() assignedToAdminId?: string; @IsOptional() @IsString() resolution?: string; }
class TicketCreateDto { @IsString() type: string; @IsString() subject: string; @IsString() body: string; @IsOptional() @IsString() orderId?: string; @IsOptional() @IsString() businessId?: string; @IsOptional() @IsString() driverId?: string; @IsOptional() @IsString() priority?: string; }
class ReplyDto { @IsString() body: string; }
class PayoutStatusDto { @IsIn(['PAID', 'FAILED', 'HELD', 'PENDING']) status: 'PAID' | 'FAILED' | 'HELD' | 'PENDING'; @IsOptional() @IsString() reference?: string; }
class StaffDto { @IsString() name: string; @IsEmail() email: string; @IsString() password: string; @IsIn(['SUPER_ADMIN', 'SUPPORT', 'STAFF']) role: 'SUPER_ADMIN' | 'SUPPORT' | 'STAFF'; }

@Controller('admin')
@Auth('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private biz: AdminBusinessService,
    private businesses: BusinessesService,
    private drivers: DriversService,
    private onboarding: OnboardingService,
    private orders: OrdersService,
    private dispatch: AssignmentService,
    private wallet: WalletService,
    private docs: DocumentsService,
    private support: SupportService,
    private payouts: PayoutsService,
    private webhooks: WebhooksService,
  ) {}

  @Get('me') me(@CurrentUser() u: Principal) { return u; }
  @Get('dashboard') dashboard(@Query('cityId') cityId?: string) { return this.admin.dashboard(cityId); }
  @Get('live-map') liveMap(@Query('cityId') cityId?: string) { return this.admin.liveMap(cityId); }
  @Get('search') search(@Query('q') q = '') { return this.admin.search(q); }

  // ── Businesses ──
  @Get('businesses') listBusinesses(@Query() q: Record<string, string>) { return this.biz.list(q); }
  @Get('businesses/:id') business(@Param('id') id: string) { return this.biz.detail(id); }
  @Post('businesses/:id/review') reviewBusiness(@Param('id') id: string, @Body() b: BusinessReviewDto, @CurrentUser() u: Principal) { return this.biz.review(id, b.action, b.reason, u.sub); }
  @Post('businesses/:id/api-access') @Auth('admin', ['SUPER_ADMIN']) api(@Param('id') id: string, @Body() b: ApiAccessDto, @CurrentUser() u: Principal) { return this.biz.setApi(id, b, u.sub); }
  @Post('businesses/:id/api-keys/:keyId/revoke') revokeKey(@Param('id') id: string, @Param('keyId') keyId: string, @CurrentUser() u: Principal) {
    return this.businesses.revokeApiKey(id, keyId, { type: 'ADMIN', id: u.sub });
  }
  @Post('businesses/:id/wallet-adjust') @Auth('admin', ['SUPER_ADMIN', 'SUPPORT']) adjust(@Param('id') id: string, @Body() b: WalletAdjustDto, @CurrentUser() u: Principal) {
    return this.wallet.adjust(id, b.kind, b.amount, b.reason, u.sub, b.orderId);
  }
  @Get('businesses/:id/passbook') passbook(@Param('id') id: string) { return this.wallet.passbook(id, { take: 200 }); }
  @Get('businesses/:id/wallet') walletSummary(@Param('id') id: string) { return this.wallet.summary(id); }

  // ── Documents (signed, expiring, view-logged) ──
  @Get('documents/:id/url') docUrl(@Param('id') id: string, @CurrentUser() u: Principal) { return this.docs.signedUrl(id, { type: 'ADMIN', id: u.sub }); }

  // ── Drivers ──
  @Get('drivers') listDrivers(@Query() q: Record<string, string>) { return this.drivers.adminList(q); }
  @Get('drivers/:id') driver(@Param('id') id: string) { return this.drivers.adminDetail(id); }
  @Post('drivers/invite') invite(@Body() b: InviteDto, @CurrentUser() u: Principal) { return this.onboarding.invite(b, u.sub); }
  @Post('drivers/:id/send-link') sendLink(@Param('id') id: string, @CurrentUser() u: Principal) { return this.onboarding.sendLink(id, u.sub); }
  @Post('drivers/:id/review') @Auth('admin', ['SUPER_ADMIN', 'SUPPORT']) reviewDriver(@Param('id') id: string, @Body() b: DriverReviewDto, @CurrentUser() u: Principal) {
    return this.drivers.review(id, b.action, b.reason, u.sub, { dlExpiry: b.dlExpiry, rcExpiry: b.rcExpiry });
  }
  @Get('drivers/:id/earnings') driverEarnings(@Param('id') id: string) { return this.drivers.earnings(id); }

  // ── Orders ──
  @Get('orders') listOrders(@Query() q: Record<string, string>) { return this.admin.listOrders(q); }
  @Get('orders/:id') order(@Param('id') id: string) { return this.admin.orderDetail(id); }
  @Post('orders/:id/cancel') cancel(@Param('id') id: string, @Body() b: CancelDto, @CurrentUser() u: Principal) {
    return this.orders.cancel(null, id, b.reason ?? 'SUPPORT_CANCELLED', { type: 'SUPPORT', id: u.sub }, b.note);
  }
  @Post('orders/:id/rider-goodwill') @Auth('admin', ['SUPER_ADMIN', 'SUPPORT']) goodwill(@Param('id') id: string, @Body() b: ReasonDto, @CurrentUser() u: Principal) {
    return this.admin.riderGoodwill(id, u.sub, b.reason ?? '');
  }
  @Post('orders/:id/reassign') reassign(@Param('id') id: string, @Body() b: ReasonDto, @CurrentUser() u: Principal) { return this.dispatch.supportReassign(id, u.sub, b.reason || 'Reassigned by support'); }
  @Post('orders/:id/retry-assignment') retry(@Param('id') id: string, @CurrentUser() u: Principal) { return this.dispatch.supportRetry(id, u.sub); }
  @Post('orders/:id/unlock-otp') unlock(@Param('id') id: string, @CurrentUser() u: Principal) { return this.dispatch.supportUnlockOtp(id, u.sub); }
  @Post('orders/:id/resend-otp') resend(@Param('id') id: string, @CurrentUser() u: Principal) { return this.dispatch.resendOtp(id, { type: 'SUPPORT', id: u.sub }); }
  @Post('orders/:id/force-return-complete') forceReturn(@Param('id') id: string, @CurrentUser() u: Principal) { return this.dispatch.completeReturn(id, { type: 'SUPPORT', id: u.sub }); }

  // ── Support ──
  @Get('tickets') tickets(@Query() q: Record<string, string>) { return this.support.list(q); }
  @Get('tickets/canned-replies') canned() { return CANNED_REPLIES; }
  @Post('tickets') createTicket(@Body() b: TicketCreateDto, @CurrentUser() u: Principal) { return this.support.create(b, { type: 'ADMIN', id: u.sub }); }
  @Get('tickets/:id') ticket(@Param('id') id: string) { return this.support.get(id); }
  @Post('tickets/:id/reply') reply(@Param('id') id: string, @Body() b: ReplyDto, @CurrentUser() u: Principal) { return this.support.reply(id, b.body, { type: 'ADMIN', id: u.sub }); }
  @Patch('tickets/:id') updateTicket(@Param('id') id: string, @Body() b: TicketUpdateDto) { return this.support.update(id, b); }

  // ── Payouts ──
  @Get('payouts') listPayouts(@Query() q: Record<string, string>) { return this.payouts.list(q); }
  @Post('payouts/generate') @Auth('admin', ['SUPER_ADMIN']) generate(@Body('weekStart') weekStart: string | undefined, @CurrentUser() u: Principal) { return this.payouts.generate(weekStart, u.sub); }
  @Post('payouts/:id/status') @Auth('admin', ['SUPER_ADMIN']) payoutStatus(@Param('id') id: string, @Body() b: PayoutStatusDto, @CurrentUser() u: Principal) { return this.payouts.setStatus(id, b.status, b.reference, u.sub); }
  @Get('payouts/export') @Auth('admin', ['SUPER_ADMIN']) @Header('Content-Type', 'text/csv') exportPayouts(@Query('weekStart') weekStart: string, @CurrentUser() u: Principal) { return this.payouts.exportCsv(weekStart, u.sub); }

  // ── Audit, webhooks, notifications, staff ──
  @Get('audit-log') audit(@Query() q: Record<string, string>) { return this.admin.auditLog(q); }
  @Get('webhooks/failed') failedWebhooks() { return this.webhooks.listFailed(); }
  @Post('webhooks/:id/retry') retryWebhook(@Param('id') id: string) { return this.webhooks.retry(id); }
  @Get('notifications') notifications(@Query() q: Record<string, string>) { return this.admin.notifications(q); }
  @Get('staff') @Auth('admin', ['SUPER_ADMIN']) staff() { return this.admin.listStaff(); }
  @Post('staff') @Auth('admin', ['SUPER_ADMIN']) createStaff(@Body() b: StaffDto, @CurrentUser() u: Principal) { return this.admin.createStaff(b, u.sub); }
  @Post('staff/:id/active') @Auth('admin', ['SUPER_ADMIN']) staffActive(@Param('id') id: string, @Body('active') active: boolean, @CurrentUser() u: Principal) { return this.admin.setStaffActive(id, !!active, u.sub); }
}
