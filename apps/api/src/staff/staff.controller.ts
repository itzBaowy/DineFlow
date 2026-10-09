import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  staffCreateSchema,
  staffUpdateSchema,
  staffPasswordSchema,
  staffListQuerySchema,
  type StaffCreate,
  type StaffUpdate,
  type StaffPassword,
  type StaffListQuery,
  type StaffPrincipal,
} from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { StaffService } from './staff.service';
@ApiTags('Staff administration')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}
  @Get() list(
    @CurrentStaff() actor: StaffPrincipal,
    @Query(new ZodPipe(staffListQuerySchema)) query: StaffListQuery,
  ) {
    return this.staff.list(actor.restaurantId, query);
  }
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body(new ZodPipe(staffCreateSchema)) input: StaffCreate,
  ) {
    return this.staff.create(actor, input);
  }
  @Patch(':id') update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(staffUpdateSchema)) input: StaffUpdate,
  ) {
    return this.staff.update(actor, id, input);
  }
  @Post(':id/password')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  password(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(staffPasswordSchema)) input: StaffPassword,
  ) {
    return this.staff.password(actor, id, input);
  }
}
