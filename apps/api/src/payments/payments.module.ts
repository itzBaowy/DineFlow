import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController, GuestBillController } from './payments.controller';
import { PaymentsService } from './payments.service';
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, GuestBillController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
