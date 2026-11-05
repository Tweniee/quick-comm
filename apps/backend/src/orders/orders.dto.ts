import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { CANCEL_REASONS } from './order-status';

export class CreateOrderDto {
  @IsOptional() @IsString() businessReferenceId?: string;
  @IsOptional() @IsString() pickupAddressId?: string;
  @IsString() @MinLength(1) customerName: string;
  @IsString() customerPhone: string;
  @IsString() @MinLength(3) dropAddress: string;
  @IsOptional() @IsString() dropLandmark?: string;
  @IsOptional() @IsString() dropPincode?: string;
  @Type(() => Number) @IsNumber() dropLat: number;
  @Type(() => Number) @IsNumber() dropLng: number;
  @IsString() @MinLength(1) parcelDescription: string;
  @Type(() => Number) @IsInt() @Min(1) weightGrams: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) lengthCm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) widthCm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) heightCm?: number;
  @Type(() => Number) @IsInt() @Min(0) declaredValue: number;
  @IsOptional() @IsBoolean() isFragile?: boolean;
  @IsOptional() @IsString() specialInstructions?: string;
  @IsOptional() @IsBoolean() markReady?: boolean;
}

export class EditOrderDto {
  @IsOptional() @IsString() pickupAddressId?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() dropAddress?: string;
  @IsOptional() @IsString() dropLandmark?: string;
  @IsOptional() @IsString() dropPincode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() dropLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() dropLng?: number;
  @IsOptional() @IsString() parcelDescription?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) weightGrams?: number;
  @IsOptional() @Type(() => Number) @IsInt() lengthCm?: number;
  @IsOptional() @Type(() => Number) @IsInt() widthCm?: number;
  @IsOptional() @Type(() => Number) @IsInt() heightCm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) declaredValue?: number;
  @IsOptional() @IsBoolean() isFragile?: boolean;
  @IsOptional() @IsString() specialInstructions?: string;
}

export class CancelDto {
  @IsOptional() @IsIn(Object.keys(CANCEL_REASONS)) reason?: keyof typeof CANCEL_REASONS;
  @IsOptional() @IsString() note?: string;
}
