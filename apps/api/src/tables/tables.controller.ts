import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { tableInputSchema, type TableInput, type StaffPrincipal } from '@dineflow/shared';
import { CurrentStaff } from '../auth/current-staff';
import { Public, Roles } from '../auth/policies';
import { ZodPipe } from '../common/zod.pipe';
import { TablesService } from './tables.service';

@ApiTags('Table setup')
@ApiCookieAuth('df_access')
@Roles('OWNER', 'MANAGER')
@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}
  @Get() list(@CurrentStaff() staff: StaffPrincipal) { return this.tables.list(staff.restaurantId); }
  @Post() create(@CurrentStaff() staff: StaffPrincipal, @Body(new ZodPipe(tableInputSchema)) input: TableInput) { return this.tables.save(staff, input); }
  @Patch(':id') update(@CurrentStaff() staff: StaffPrincipal, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(tableInputSchema)) input: TableInput) { return this.tables.save(staff, input, id); }
  @Delete(':id') archive(@CurrentStaff() staff: StaffPrincipal, @Param('id', new ParseUUIDPipe()) id: string) { return this.tables.archive(staff, id); }
  @Post(':id/regenerate-qr') regenerate(@CurrentStaff() staff: StaffPrincipal, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(tableInputSchema.pick({}).strict())) input: Record<string, never>) { void input; return this.tables.regenerate(staff, id); }
  @Get(':id/qr.png') async png(@CurrentStaff() staff: StaffPrincipal, @Param('id', new ParseUUIDPipe()) id: string, @Res() response: Response) { response.type('png').setHeader('Content-Disposition', `attachment; filename="dineflow-${id}.png"`); response.send(await this.tables.qr(staff.restaurantId, id, 'png')); }
  @Get(':id/qr.svg') async svg(@CurrentStaff() staff: StaffPrincipal, @Param('id', new ParseUUIDPipe()) id: string, @Res() response: Response) { response.type('svg').setHeader('Content-Disposition', `attachment; filename="dineflow-${id}.svg"`); response.send(await this.tables.qr(staff.restaurantId, id, 'svg')); }
}

@ApiTags('Public table context')
@Controller('public/tables')
export class PublicTablesController {
  constructor(private readonly tables: TablesService) {}
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':code') context(@Param('code') code: string) { return this.tables.context(code); }
}
