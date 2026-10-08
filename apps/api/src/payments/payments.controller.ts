import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  discountInputSchema,
  paymentInputSchema,
  billingSessionInputSchema,
  type DiscountInput,
  type PaymentInput,
  type BillingSessionInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Public, Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { guestToken } from '../orders/orders.controller';
import { PaymentsService } from './payments.service';

@ApiTags('Billing & receipts')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER', 'WAITER', 'CASHIER')
@Controller('billing')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Get('sessions/:id/bill') bill(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.bill(staff.restaurantId, id);
  }
  @Get('sessions/:id/receipt') sessionReceipt(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.sessionReceipt(staff.restaurantId, id);
  }
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  @Patch('sessions/:id/discount')
  discount(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(discountInputSchema)) input: DiscountInput,
  ) {
    return this.payments.discount(staff, id, input);
  }
  @Post('sessions/:id/status') transition(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(billingSessionInputSchema)) input: BillingSessionInput,
  ) {
    return this.payments.transition(staff, id, input);
  }
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  @Post('sessions/:id/payments')
  pay(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(paymentInputSchema)) input: PaymentInput,
  ) {
    return this.payments.pay(staff, id, input);
  }
  @Get('receipts') recent(@CurrentStaff() staff: StaffPrincipal) {
    return this.payments.recent(staff.restaurantId);
  }
  @Get('receipts/:id') receipt(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.getReceipt(staff.restaurantId, id);
  }
}
@Public()
@ApiTags('Guest bill')
@ApiCookieAuth('df_guest')
@Controller('public/tables/:code/bill')
export class GuestBillController {
  constructor(private readonly payments: PaymentsService) {}
  @Get() bill(@Param('code') code: string, @Req() request: Request) {
    return this.payments.guestBill(code, guestToken(request));
  }
}
