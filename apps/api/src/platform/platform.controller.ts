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
import { mfaCodeSchema, changePasswordSchema } from '@dineflow/shared';
import { AccountService } from '../security/account.service';

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
    response.cookie('df_platform_challenge', credentials.challengeToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/platform/auth',
      maxAge: 5 * 60000,
    });
    return { mfaRequired: true, setupRequired: credentials.setupRequired };
  }
  @Get('mfa/setup')
  async setup(@Req() request: Request) {
    return this.service.setup(
      (request.cookies as Record<string, unknown>)?.df_platform_challenge,
    );
  }
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verify(
    @Req() request: Request,
    @Body(new ZodPipe(mfaCodeSchema)) input: { code: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = await this.service.finishMfa(
      (request.cookies as Record<string, unknown>)?.df_platform_challenge,
      input.code,
    );
    response.cookie('df_platform', credentials.token, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/platform',
      maxAge: 8 * 3600000,
    });
    response.clearCookie('df_platform_challenge', {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/platform/auth',
    });
    return credentials.principal;
  }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.service.cancelChallenge(
      (request.cookies as Record<string, unknown>)?.df_platform_challenge,
    );
    response.clearCookie('df_platform_challenge', {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/v1/platform/auth',
    });
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
  constructor(
    private readonly service: PlatformService,
    private readonly accounts: AccountService,
  ) {}
  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Req() request: PlatformRequest,
    @Body(new ZodPipe(changePasswordSchema))
    input: { currentPassword: string; password: string },
  ) {
    await this.accounts.change(
      request.platform.userId,
      request.platform.sessionId,
      true,
      input.currentPassword,
      input.password,
    );
    return { accepted: true };
  }
  @Get('security')
  security(@Req() request: PlatformRequest) {
    return this.accounts.status(request.platform.userId);
  }
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
