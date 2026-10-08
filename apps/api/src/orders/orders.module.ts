import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PublicOrdersController, SessionOrdersController } from './orders.controller';
import { OperationsService } from './operations.service';
import {
  OperationsController,
  KitchenController,
  ManualOrdersController,
} from './operations.controller';
@Module({
  controllers: [
    PublicOrdersController,
    SessionOrdersController,
    OperationsController,
    KitchenController,
    ManualOrdersController,
  ],
  providers: [OrdersService, OperationsService],
})
export class OrdersModule {}
