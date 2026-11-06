import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { SupportService } from './support.service';

class TicketDto { @IsString() type: string; @IsString() subject: string; @IsString() body: string; @IsOptional() @IsString() orderId?: string; }
class ReplyDto { @IsString() body: string; }

@Controller('business/tickets')
@Auth('business')
export class BusinessTicketsController {
  constructor(private support: SupportService) {}
  @Get() list(@CurrentUser() u: Principal, @Query('status') status?: string) { return this.support.list({ businessId: u.businessId, status }); }
  @Post() create(@CurrentUser() u: Principal, @Body() b: TicketDto) { return this.support.create({ ...b, businessId: u.businessId }, { type: 'BUSINESS', id: u.sub }); }
  @Get(':id') get(@CurrentUser() u: Principal, @Param('id') id: string) { return this.support.get(id, u.businessId); }
  @Post(':id/reply') reply(@CurrentUser() u: Principal, @Param('id') id: string, @Body() b: ReplyDto) { return this.support.reply(id, b.body, { type: 'BUSINESS', id: u.sub }, u.businessId); }
}
