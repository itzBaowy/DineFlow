import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { closeEmptyInputSchema, emptyInputSchema, type StaffPrincipal } from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { DiningSessionsService } from './dining-sessions.service';

@ApiTags('Dining sessions')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER', 'WAITER', 'CASHIER')
@Controller('dining-sessions/tables')
export class DiningSessionsController {
  constructor(private readonly sessions: DiningSessionsService) {}
  @Get() list(@CurrentStaff() staff: StaffPrincipal) {
    return this.sessions.list(staff.restaurantId);
  }
  @Roles('OWNER', 'MANAGER', 'WAITER')
  @Post(':id/open')
  open(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(emptyInputSchema)) _input: Record<string, never>,
  ) {
    void _input;
    return this.sessions.open(staff, id);
  }
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  @Post(':id/close-empty')
  close(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(closeEmptyInputSchema)) input: { reason: string },
  ) {
    return this.sessions.closeEmpty(staff, id, input.reason);
  }
  @Roles('OWNER', 'MANAGER', 'WAITER')
  @Post(':id/clean')
  clean(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(emptyInputSchema)) _input: Record<string, never>,
  ) {
    void _input;
    return this.sessions.clean(staff, id);
  }
}
