import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class AdminLoginDto { @IsString() email: string; @IsString() @MinLength(1) password: string; }
class BusinessLoginDto { @IsString() login: string; @IsString() @MinLength(1) password: string; }
class PhoneDto { @IsString() phone: string; }
class VerifyDto { @IsString() phone: string; @IsString() code: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('admin/login') admin(@Body() b: AdminLoginDto) { return this.auth.adminLogin(b.email, b.password); }
  @Post('business/login') business(@Body() b: BusinessLoginDto) { return this.auth.businessLogin(b.login, b.password); }
  @Post('driver/request-otp') driverOtp(@Body() b: PhoneDto) { return this.auth.driverRequestOtp(b.phone); }
  @Post('driver/verify-otp') driverVerify(@Body() b: VerifyDto) { return this.auth.driverVerifyOtp(b.phone, b.code); }
}
