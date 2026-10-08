import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { RestaurantController } from './restaurant/restaurant.controller';

@Module({ imports: [ConfigModule, DatabaseModule, AuthModule], controllers: [HealthController, RestaurantController] })
export class AppModule {}
