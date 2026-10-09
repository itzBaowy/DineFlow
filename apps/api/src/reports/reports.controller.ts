import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  reportQuerySchema,
  historyQuerySchema,
  activityQuerySchema,
  type ReportQuery,
  type HistoryQuery,
  type ActivityQuery,
  type StaffPrincipal,
} from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { ReportsService } from './reports.service';

@ApiTags('Admin analytics & history')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('revenue') revenue(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodPipe(reportQuerySchema)) query: ReportQuery,
  ) {
    return this.reports.revenue(staff.restaurantId, query);
  }
  @Get('orders') history(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodPipe(historyQuerySchema)) query: HistoryQuery,
  ) {
    return this.reports.history(staff.restaurantId, query);
  }
  @Get('orders/:id') detail(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.reports.detail(staff.restaurantId, id);
  }
  @Get('activity') activity(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodPipe(activityQuerySchema)) query: ActivityQuery,
  ) {
    return this.reports.activity(staff.restaurantId, query);
  }
}
