import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { emptyInputSchema, type StaffPrincipal } from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { ZodPipe } from '../common/zod.pipe';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}
  @Post('ticket') ticket(
    @CurrentStaff() staff: StaffPrincipal,
    @Req() request: Request,
    @Body(new ZodPipe(emptyInputSchema)) _input: Record<string, never>,
  ) {
    void _input;
    return this.realtime.staffTicket(staff, (request.cookies as { df_access: string }).df_access);
  }
}
