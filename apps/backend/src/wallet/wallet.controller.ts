import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { Request } from 'express';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { PaymentsService } from './payments.service';
import { WalletService } from './wallet.service';

class RechargeDto { @Type(() => Number) @IsInt() @Min(1) amount: number; }

@Controller('business/wallet')
@Auth('business')
export class BusinessWalletController {
  constructor(private wallet: WalletService, private payments: PaymentsService) {}

  @Get() summary(@CurrentUser() u: Principal) { return this.wallet.summary(u.businessId!); }
  @Get('passbook') passbook(@CurrentUser() u: Principal, @Query('take') take?: string, @Query('cursor') cursor?: string) {
    return this.wallet.passbook(u.businessId!, { take: take ? Number(take) : undefined, cursor });
  }
  @Post('recharges') recharge(@CurrentUser() u: Principal, @Body() b: RechargeDto) { return this.payments.createRecharge(u.businessId!, b.amount); }
  @Post('recharges/:id/mock-pay') mockPay(@CurrentUser() u: Principal, @Param('id') id: string) { return this.payments.mockPay(u.businessId!, id); }
}

@Controller('payments')
export class PaymentsWebhookController {
  constructor(private payments: PaymentsService) {}
  @Post('razorpay/webhook')
  razorpay(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-razorpay-signature') sig?: string) {
    return this.payments.razorpayWebhook(req.rawBody?.toString('utf8') ?? JSON.stringify(req.body), sig);
  }
}
