import { Global, Module } from '@nestjs/common';
import { AdminCitiesController, PublicCitiesController } from './cities.controller';
import { CitiesService } from './cities.service';

@Global()
@Module({ controllers: [PublicCitiesController, AdminCitiesController], providers: [CitiesService], exports: [CitiesService] })
export class CitiesModule {}
