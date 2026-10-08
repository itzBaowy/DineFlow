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
import { DiningSessionsModule } from './dining-sessions/dining-sessions.module';
import { OrdersModule } from './orders/orders.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({ imports: [ConfigModule, DatabaseModule, AuthModule, RealtimeModule, SetupModule, MenuModule, TablesModule, StorageModule, DiningSessionsModule, OrdersModule], controllers: [HealthController, RestaurantController] })
export class AppModule {}
