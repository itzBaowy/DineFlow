import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, type LoginInput, type StaffPrincipal } from '@dineflow/shared';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './policies';
import { CONFIG, type AppConfig } from '../config/env';
import { ZodPipe } from '../common/zod.pipe';
import { CurrentStaff } from './current-staff';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(CONFIG) private readonly config: AppConfig) {}
  private cookies(response: Response, credentials: Awaited<ReturnType<AuthService['login']>>): void {
    const options = { httpOnly: true, secure: this.config.COOKIE_SECURE, sameSite: 'lax' as const };
    response.cookie('df_access', credentials.accessToken, { ...options, path: '/api/v1', maxAge: this.config.ACCESS_TOKEN_TTL_SECONDS * 1000 });
    response.cookie('df_refresh', credentials.refreshToken, { ...options, path: '/api/v1/auth', maxAge: Math.max(0, credentials.expiresAt.getTime() - Date.now()) });
    response.setHeader('Cache-Control', 'no-store');
  }
  private clearCookies(response: Response): void {
    const options = { httpOnly: true, secure: this.config.COOKIE_SECURE, sameSite: 'lax' as const };
    response.clearCookie('df_access', { ...options, path: '/api/v1' });
    response.clearCookie('df_refresh', { ...options, path: '/api/v1/auth' });
    response.setHeader('Cache-Control', 'no-store');
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đăng nhập nhân viên; credentials chỉ đặt trong HttpOnly cookies' })
  @ApiBody({ schema: { type: 'object', required: ['email', 'password'], additionalProperties: false, properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', maxLength: 128 } } } })
  @ApiResponse({ status: 200, description: 'Thông tin nhân viên, không trả access/refresh token' })
  async login(@Body(new ZodPipe(loginSchema)) input: LoginInput, @Res({ passthrough: true }) response: Response) {
    const credentials = await this.auth.login(input);
    this.cookies(response, credentials);
    return credentials.staff;
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Rotate refresh token; reuse revoke toàn bộ auth session' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token: unknown = (request.cookies as Record<string, unknown> | undefined)?.df_refresh;
    try {
      if (typeof token !== 'string') throw new UnauthorizedException('Vui lòng đăng nhập');
      const credentials = await this.auth.refresh(token);
      this.cookies(response, credentials);
      return credentials.staff;
    } catch (error) {
      if (error instanceof UnauthorizedException) this.clearCookies(response);
      throw error;
    }
  }
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke auth session và xóa cookies' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout((request.cookies as Record<string, unknown> | undefined)?.df_refresh);
    this.clearCookies(response);
  }
  @Get('me')
  @ApiCookieAuth('df_access')
  @ApiOperation({ summary: 'Thông tin user, membership và restaurant scope hiện tại' })
  me(@CurrentStaff() staff: StaffPrincipal): StaffPrincipal { return staff; }
}
