import { Body, Controller, Get, Param, Post, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { AppError } from '../common/errors';
import { AssignmentService } from '../assignment/assignment.service';
import { UNDELIVERED_REASONS, UndeliveredReason } from '../orders/order-status';
import { DriversService } from './drivers.service';
import { OnboardingForm, OnboardingService, REQUIRED_DRIVER_DOCS } from './onboarding.service';

class GeoDto {
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  /** When the action happened on the phone (offline queue keeps original time). */
  @IsOptional() @IsString() occurredAt?: string;
}
class OnlineDto extends GeoDto { @IsBoolean() online: boolean; }
class LocationDto { @Type(() => Number) @IsNumber() lat: number; @Type(() => Number) @IsNumber() lng: number; }
class PickupDto extends GeoDto { @IsOptional() @IsString() photoDocumentId?: string; }
class RefuseDto extends GeoDto { @IsIn(['SUSPICIOUS', 'OVERSIZE', 'NOT_SEALED', 'NOT_READY']) reason: 'SUSPICIOUS' | 'OVERSIZE' | 'NOT_SEALED' | 'NOT_READY'; @IsOptional() @IsString() note?: string; }
class CallDto extends GeoDto { @IsIn(['CUSTOMER', 'BUSINESS', 'SUPPORT']) target: 'CUSTOMER' | 'BUSINESS' | 'SUPPORT'; @IsOptional() @IsString() outcome?: string; }
class DeliverDto extends GeoDto { @IsString() otp: string; }
class UndeliveredDto extends GeoDto { @IsIn(Object.keys(UNDELIVERED_REASONS)) reason: UndeliveredReason; @IsOptional() @IsString() note?: string; }
class ReturnDto extends GeoDto { @IsString() code: string; }
class LangDto { @IsIn(['en', 'hi']) language: string; }

/** Public onboarding web form (no app install needed). */
@Controller('onboarding')
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  @Get(':token') describe(@Param('token') token: string) { return this.onboarding.describe(token); }

  @Post(':token')
  @UseInterceptors(FileFieldsInterceptor(REQUIRED_DRIVER_DOCS.map((name) => ({ name, maxCount: 1 })), { limits: { fileSize: 8 * 1024 * 1024 } }))
  submit(@Param('token') token: string, @Body() form: OnboardingForm, @UploadedFiles() files: Record<string, Express.Multer.File[]>) {
    const flat = Object.fromEntries(Object.entries(files ?? {}).map(([k, v]) => [k, v?.[0]]));
    return this.onboarding.submit(token, form, flat);
  }
}

/** Driver App API. */
@Controller('driver')
@Auth('driver')
export class DriverAppController {
  constructor(private drivers: DriversService, private dispatch: AssignmentService) {}

  @Get('me') me(@CurrentUser() u: Principal) { return this.drivers.me(u.sub); }
  @Post('language') lang(@CurrentUser() u: Principal, @Body() b: LangDto) { return this.drivers.setLanguage(u.sub, b.language); }
  @Post('availability') online(@CurrentUser() u: Principal, @Body() b: OnlineDto) {
    return this.drivers.setOnline(u.sub, b.online, b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : undefined);
  }
  @Post('location') location(@CurrentUser() u: Principal, @Body() b: LocationDto) { return this.drivers.updateLocation(u.sub, b.lat, b.lng); }
  @Get('documents') documents(@CurrentUser() u: Principal) { return this.drivers.documentsView(u.sub); }
  @Get('earnings') earnings(@CurrentUser() u: Principal) { return this.drivers.earnings(u.sub); }

  @Post('documents/renewal')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  renewal(@CurrentUser() u: Principal, @Body('kind') kind: 'DL_FRONT', @Body('expiry') expiry: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Attach a photo of the renewed document', 422);
    return this.drivers.uploadRenewal(u.sub, kind, expiry, file);
  }

  /** Polling fallback when the socket drops. Returns the live job if any, else the pending offer. */
  @Get('feed') async feed(@CurrentUser() u: Principal) {
    const job = await this.dispatch.currentJob(u.sub);
    return { job, offer: job ? null : await this.dispatch.pendingOffer(u.sub), serverTime: new Date() };
  }
  @Post('offers/:id/accept') accept(@CurrentUser() u: Principal, @Param('id') id: string) { return this.dispatch.accept(u.sub, id); }
  @Post('offers/:id/decline') decline(@CurrentUser() u: Principal, @Param('id') id: string) { return this.dispatch.decline(u.sub, id); }

  @Get('job') job(@CurrentUser() u: Principal) { return this.dispatch.currentJob(u.sub); }
  @Post('orders/:id/pickup') pickup(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: PickupDto) { return this.dispatch.pickup(u.sub, id, b, b.photoDocumentId); }
  @Post('orders/:id/refuse-pickup') refuse(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: RefuseDto) { return this.dispatch.refusePickup(u.sub, id, b.reason, b.note, b); }
  @Post('orders/:id/arrived') arrived(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: GeoDto) { return this.dispatch.arrived(u.sub, id, b); }
  @Post('orders/:id/calls') call(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: CallDto) { return this.dispatch.logCall(u.sub, id, b.target, b.outcome, b); }
  @Post('orders/:id/deliver') deliver(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: DeliverDto) { return this.dispatch.deliver(u.sub, id, b.otp, b); }
  @Post('orders/:id/undelivered') undelivered(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: UndeliveredDto) { return this.dispatch.undelivered(u.sub, id, b.reason, b, b.note); }
  @Post('orders/:id/returned') returned(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: ReturnDto) { return this.dispatch.returnWithCode(u.sub, id, b.code, b); }
  @Post('orders/:id/help') help(@CurrentUser() u: Principal, @Param('id') id: string, @Body('message') message: string) {
    return this.drivers.helpRequest(u.sub, id, message);
  }
}
