import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PublicOrdersController, SessionOrdersController } from './orders.controller';
@Module({
  controllers: [PublicOrdersController, SessionOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
