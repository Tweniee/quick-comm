import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Auth, CurrentUser } from '../auth/auth.guard';
import { Principal } from '../auth/auth.types';
import { CitiesService } from './cities.service';

class CityDto {
  @IsString() name: string;
  @IsNumber() centerLat: number;
  @IsNumber() centerLng: number;
  @IsOptional() @IsNumber() @Min(1) @Max(25) radiusKm?: number;
  @IsOptional() @IsString() opensAt?: string;
  @IsOptional() @IsString() closesAt?: string;
}
class CityUpdateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() centerLat?: number;
  @IsOptional() @IsNumber() centerLng?: number;
  @IsOptional() @IsNumber() radiusKm?: number;
  @IsOptional() @IsString() opensAt?: string;
  @IsOptional() @IsString() closesAt?: string;
  @IsOptional() @IsString() reason?: string;
}
class PauseDto { @IsBoolean() paused: boolean; @IsOptional() @IsString() message?: string; }
class PricingDto {
  @Type(() => Number) @IsInt() @Min(1) deliveryFee: number;
  @Type(() => Number) @IsInt() @Min(0) returnFee: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) driverSharePct?: number;
  @IsOptional() @IsInt() minRechargeAmount?: number;
  @IsOptional() @IsInt() maxRechargeAmount?: number;
  @IsOptional() @IsInt() lowBalanceWarnAt?: number;
  @IsOptional() @IsString() effectiveFrom?: string;
}

/** Public: list active cities for signup forms. */
@Controller('cities')
export class PublicCitiesController {
  constructor(private cities: CitiesService) {}
  @Get() async list() {
    const all = await this.cities.list();
    return all.map((c) => ({ id: c.id, name: c.name, status: c.status, centerLat: c.centerLat, centerLng: c.centerLng, radiusKm: c.radiusKm }));
  }
}

@Controller('admin/cities')
export class AdminCitiesController {
  constructor(private cities: CitiesService) {}

  @Get() @Auth('admin') list() { return this.cities.list(); }
  @Post() @Auth('admin', ['SUPER_ADMIN']) create(@Body() b: CityDto, @CurrentUser() u: Principal) { return this.cities.create(b, u.sub); }
  @Patch(':id') @Auth('admin', ['SUPER_ADMIN']) update(@Param('id') id: string, @Body() b: CityUpdateDto, @CurrentUser() u: Principal) {
    const { reason, ...data } = b;
    return this.cities.update(id, data, u.sub, reason);
  }
  @Post(':id/pause') @Auth('admin', ['SUPER_ADMIN']) pause(@Param('id') id: string, @Body() b: PauseDto, @CurrentUser() u: Principal) {
    return this.cities.setPaused(id, b.paused, b.message, u.sub);
  }
  @Get(':id/pricing') @Auth('admin') pricing(@Param('id') id: string) { return this.cities.pricingHistory(id); }
  @Post(':id/pricing') @Auth('admin', ['SUPER_ADMIN']) setPricing(@Param('id') id: string, @Body() b: PricingDto, @CurrentUser() u: Principal) {
    return this.cities.setPricing(id, b, u.sub);
  }
}
