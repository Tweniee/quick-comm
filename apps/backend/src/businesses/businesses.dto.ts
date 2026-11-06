import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { BusinessType } from '@prisma/client';

export class AddressDto {
  @IsOptional() @IsString() label?: string;
  @IsString() @MinLength(5) address: string;
  @IsOptional() @IsString() landmark?: string;
  @IsString() pincode: string;
  @Type(() => Number) @IsNumber() lat: number;
  @Type(() => Number) @IsNumber() lng: number;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class SignupDto {
  @IsString() cityId: string;
  @IsString() @MinLength(2) name: string;
  @IsEnum(BusinessType) type: BusinessType;
  @IsString() @MinLength(2) ownerName: string;
  @IsString() phone: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() googleProfile?: string;
  @IsBoolean() acceptTerms: boolean;
  @ValidateNested() @Type(() => AddressDto) pickup: AddressDto;
}

export class ProfileDto {
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() googleProfile?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() billingAddress?: string;
}

export class ApiKeyDto { @IsIn(['TEST', 'LIVE']) mode: 'TEST' | 'LIVE'; }
export class WebhookDto { @IsOptional() @IsString() url: string | null; }
