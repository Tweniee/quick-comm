import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';

@Module({ controllers: [PublicApiController], providers: [ApiKeyGuard] })
export class PublicApiModule {}
