import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PublicOrdersController, SessionOrdersController } from './orders.controller';
import { OperationsService } from './operations.service';
import { ServiceRequestsService } from './service-requests.service';
import {
  GuestServiceRequestsController,
  StaffServiceRequestsController,
} from './service-requests.controller';
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
    GuestServiceRequestsController,
    StaffServiceRequestsController,
  ],
  providers: [OrdersService, OperationsService, ServiceRequestsService],
})
export class OrdersModule {}
