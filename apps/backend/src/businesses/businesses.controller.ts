import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { AppError } from '../common/errors';
import { AddressDto, ApiKeyDto, ProfileDto, SignupDto, WebhookDto } from './businesses.dto';
import { BusinessesService } from './businesses.service';

@Controller('business')
export class BusinessesController {
  constructor(private svc: BusinessesService) {}

  @Post('signup') signup(@Body() b: SignupDto) { return this.svc.signup(b); }

  @Get('me') @Auth('business') me(@CurrentUser() u: Principal) { return this.svc.me(u.businessId!); }
  @Patch('me') @Auth('business', ['OWNER']) update(@CurrentUser() u: Principal, @Body() b: ProfileDto) { return this.svc.updateProfile(u.businessId!, b); }

  @Post('documents') @Auth('business', ['OWNER'])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  upload(@CurrentUser() u: Principal, @Body('kind') kind: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Attach a file in the "file" field', 422);
    return this.svc.uploadDocument(u.businessId!, kind, file);
  }

  @Post('addresses') @Auth('business', ['OWNER']) addAddr(@CurrentUser() u: Principal, @Body() b: AddressDto) { return this.svc.addAddress(u.businessId!, { ...b, label: b.label || 'Branch' }); }
  @Patch('addresses/:id') @Auth('business', ['OWNER']) updAddr(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: AddressDto) { return this.svc.updateAddress(u.businessId!, id, b); }
  @Delete('addresses/:id') @Auth('business', ['OWNER']) delAddr(@CurrentUser() u: Principal, @Param('id') id: string) { return this.svc.removeAddress(u.businessId!, id); }

  @Get('api-keys') @Auth('business', ['OWNER']) keys(@CurrentUser() u: Principal) { return this.svc.listApiKeys(u.businessId!); }
  @Post('api-keys') @Auth('business', ['OWNER']) createKey(@CurrentUser() u: Principal, @Body() b: ApiKeyDto) { return this.svc.createApiKey(u.businessId!, b.mode); }
  @Delete('api-keys/:id') @Auth('business', ['OWNER']) revoke(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.svc.revokeApiKey(u.businessId!, id, { type: 'BUSINESS', id: u.sub });
  }
  @Post('webhook') @Auth('business', ['OWNER']) webhook(@CurrentUser() u: Principal, @Body() b: WebhookDto) { return this.svc.setWebhook(u.businessId!, b.url || null); }
  @Post('webhook/rotate-secret') @Auth('business', ['OWNER']) rotate(@CurrentUser() u: Principal) { return this.svc.rotateWebhookSecret(u.businessId!); }
}
