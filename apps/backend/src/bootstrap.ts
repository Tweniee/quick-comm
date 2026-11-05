import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { config } from './common/config';
import { AppError } from './common/errors';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const first = errors[0];
        const msg = first ? Object.values(first.constraints ?? {})[0] ?? `Invalid ${first.property}` : 'Invalid request';
        return new AppError('VALIDATION_ERROR', msg, 422, 'FIX_INPUT', { fields: errors.map((e) => e.property) }) as BadRequestException;
      },
    }),
  );
  return app;
}

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: process.env.NODE_ENV === 'test' ? false : undefined });
  return configureApp(app);
}
