import { Module } from '@nestjs/common';
import { DriverAppController, OnboardingController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { OnboardingService } from './onboarding.service';

@Module({ controllers: [OnboardingController, DriverAppController], providers: [DriversService, OnboardingService], exports: [DriversService, OnboardingService] })
export class DriversModule {}
