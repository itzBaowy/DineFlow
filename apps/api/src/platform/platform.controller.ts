import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  loginSchema,
  platformAuditQuerySchema,
  platformSettingsInputSchema,
  platformTenantQuerySchema,
  tenantStatusInputSchema,
  type LoginInput,
  type PlatformSettingsInput,
  type PlatformTenantQuery,
  type TenantStatusInput,
} from '@dineflow/shared';
import { Public } from '../auth/policies';
import { CONFIG, type AppConfig } from '../config/env';
import { ZodPipe } from '../common/zod.pipe';
import { PlatformService } from './platform.service';
import { PlatformGuard, type PlatformRequest } from './platform.guard';

@Public()
@ApiTags('Platform authentication')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly service: PlatformService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body(new ZodPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = await this.service.login(input);
    response.cookie('df_platform', credentials.token, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/platform',
      maxAge: 8 * 3600000,
    });
    return credentials.principal;
  }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.service.logout(
      (request.cookies as Record<string, unknown> | undefined)?.df_platform,
    );
    response.clearCookie('df_platform', {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/platform',
    });
  }
  @Get('me')
  @UseGuards(PlatformGuard)
  me(@Req() request: PlatformRequest) {
    return request.platform;
  }
}
@Public()
@UseGuards(PlatformGuard)
@ApiCookieAuth('df_platform')
@ApiTags('Platform administration')
@Controller('platform')
export class PlatformController {
  constructor(private readonly service: PlatformService) {}
  @Get('overview') overview() {
    return this.service.overview();
  }
  @Get('tenants') tenants(
    @Query(new ZodPipe(platformTenantQuerySchema)) query: PlatformTenantQuery,
  ) {
    return this.service.tenants(query);
  }
  @Patch('tenants/:id/status') status(
    @Req() request: PlatformRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(tenantStatusInputSchema)) input: TenantStatusInput,
  ) {
    return this.service.status(request.platform, id, input);
  }
  @Patch('settings') settings(
    @Req() request: PlatformRequest,
    @Body(new ZodPipe(platformSettingsInputSchema)) input: PlatformSettingsInput,
  ) {
    return this.service.settings(request.platform, input);
  }
  @Get('audit') audit(
    @Query(new ZodPipe(platformAuditQuerySchema)) query: { page: number; pageSize: number },
  ) {
    return this.service.audit(query);
  }
}
