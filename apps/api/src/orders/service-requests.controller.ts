import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  serviceRequestInputSchema,
  serviceRequestListQuerySchema,
  serviceRequestTransitionSchema,
  type ServiceRequestInput,
  type ServiceRequestListQuery,
  type ServiceRequestTransition,
  type StaffPrincipal,
} from '@dineflow/shared';
import { Public, Roles } from '../auth/policies';
import { CurrentStaff } from '../auth/current-staff';
import { ZodPipe } from '../common/zod.pipe';
import { guestToken } from './orders.controller';
import { ServiceRequestsService } from './service-requests.service';

@Public()
@ApiTags('Guest table service')
@ApiCookieAuth('df_guest')
@Controller('public/tables/:code/service-requests')
export class GuestServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}
  @Get() list(@Param('code') code: string, @Req() request: Request) {
    return this.requests.guestList(code, guestToken(request));
  }
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  create(
    @Param('code') code: string,
    @Req() request: Request,
    @Body(new ZodPipe(serviceRequestInputSchema)) input: ServiceRequestInput,
  ) {
    return this.requests.create(code, input, guestToken(request));
  }
}
@Roles('OWNER', 'MANAGER', 'WAITER', 'CASHIER')
@ApiTags('Staff service requests')
@ApiCookieAuth('df_access')
@Controller('service-requests')
export class StaffServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}
  @Get() list(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodPipe(serviceRequestListQuerySchema)) query: ServiceRequestListQuery,
  ) {
    return this.requests.list(staff.restaurantId, query);
  }
  @Patch(':id/status') transition(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(serviceRequestTransitionSchema)) input: ServiceRequestTransition,
  ) {
    return this.requests.transition(staff, id, input);
  }
}
