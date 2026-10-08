import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { RestaurantController } from './restaurant/restaurant.controller';
import { SetupModule } from './common/setup.module';
import { MenuModule } from './menu/menu.module';
import { TablesModule } from './tables/tables.module';
import { StorageModule } from './storage/storage.module';

@Module({ imports: [ConfigModule, DatabaseModule, AuthModule, SetupModule, MenuModule, TablesModule, StorageModule], controllers: [HealthController, RestaurantController] })
export class AppModule {}
