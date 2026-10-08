import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  createOrderInputSchema,
  kitchenListQuerySchema,
  orderListQuerySchema,
  orderStatusInputSchema,
  type CreateOrderInput,
  type OrderListQuery,
  type OrderStatusInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { OperationsService } from './operations.service';

@ApiTags('Staff orders')
@ApiCookieAuth('df_access')
@Controller('orders')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  @Roles('OWNER', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN')
  @Get('overview')
  overview(@CurrentStaff() staff: StaffPrincipal) {
    return this.operations.overview(staff.restaurantId);
  }
  @Roles('OWNER', 'MANAGER', 'WAITER', 'CASHIER')
  @Get()
  list(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    return this.operations.list(staff.restaurantId, query);
  }
  @Roles('OWNER', 'MANAGER', 'WAITER', 'KITCHEN')
  @Patch(':id/status')
  transition(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(orderStatusInputSchema)) input: OrderStatusInput,
  ) {
    return this.operations.transition(staff, id, input);
  }
}
@ApiTags('Kitchen display')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER', 'KITCHEN')
@Controller('kitchen/orders')
export class KitchenController {
  constructor(private readonly operations: OperationsService) {}
  @Get() list(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodPipe(kitchenListQuerySchema)) query: OrderListQuery,
  ) {
    return this.operations.list(staff.restaurantId, query);
  }
}
@ApiTags('Manual staff orders')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER', 'WAITER')
@Controller('dining-sessions')
export class ManualOrdersController {
  constructor(private readonly operations: OperationsService) {}
  @Get(':id/menu') menu(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.operations.menu(staff, id);
  }
  @Post(':id/orders') create(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(createOrderInputSchema)) input: CreateOrderInput,
  ) {
    return this.operations.create(staff, id, input);
  }
}
