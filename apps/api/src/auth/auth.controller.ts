import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  staffLoginSchema,
  registerSchema,
  createRestaurantSchema,
  switchRestaurantSchema,
  type CreateRestaurantInput,
  type RegisterInput,
  type StaffLoginInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public, Roles } from './policies';
import { CONFIG, type AppConfig } from '../config/env';
import { ZodPipe } from '../common/zod.pipe';
import { CurrentStaff } from './current-staff';
import { RegistrationService } from './registration.service';
import { TenancyService } from './tenancy.service';
import { AccountService } from '../security/account.service';
import {
  accountTokenSchema,
  emailRequestSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '@dineflow/shared';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly tenancy: TenancyService,
    private readonly accounts: AccountService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  @Public()
  @Get('registration-settings')
  registrationSettings() {
    return this.registration.settings();
  }
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  async register(@Body(new ZodPipe(registerSchema)) input: RegisterInput) {
    await this.registration.register(input);
    return { registered: true };
  }
  private cookies(
    response: Response,
    credentials: Awaited<ReturnType<AuthService['switchRestaurant']>>,
  ): void {
    const options = {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax' as const,
    };
    response.cookie('df_access', credentials.accessToken, {
      ...options,
      path: '/api/v1',
      maxAge: this.config.ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    response.cookie('df_refresh', credentials.refreshToken, {
      ...options,
      path: '/api/v1/auth',
      maxAge: Math.max(0, credentials.expiresAt.getTime() - Date.now()),
    });
    response.setHeader('Cache-Control', 'no-store');
  }
  private clearCookies(response: Response): void {
    const options = {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax' as const,
    };
    response.clearCookie('df_access', { ...options, path: '/api/v1' });
    response.clearCookie('df_refresh', { ...options, path: '/api/v1/auth' });
    response.setHeader('Cache-Control', 'no-store');
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đăng nhập nhân viên; credentials chỉ đặt trong HttpOnly cookies' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      additionalProperties: false,
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', maxLength: 128 },
        restaurantId: {
          type: 'string',
          format: 'uuid',
          description: 'Chọn membership của chính user khi có nhiều nhà hàng',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Staff principal hoặc selectionRequired + restaurants khi cần chọn; không trả access/refresh token',
  })
  async login(
    @Body(new ZodPipe(staffLoginSchema)) input: StaffLoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = await this.auth.login(input);
    if ('selectionRequired' in credentials) {
      response.setHeader('Cache-Control', 'no-store');
      return credentials;
    }
    this.cookies(response, credentials);
    return credentials.staff;
  }
  @Get('restaurants')
  @ApiCookieAuth('df_access')
  @ApiOperation({
    summary: 'Danh sách memberships active của chính user, gồm trạng thái tenant',
  })
  restaurants(@CurrentStaff() staff: StaffPrincipal) {
    return this.auth.restaurants(staff.userId);
  }
  @Roles('OWNER')
  @Post('restaurants')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiCookieAuth('df_access')
  @ApiOperation({
    summary: 'OWNER tạo thêm tenant trống bằng cùng tài khoản; giữ scope hiện tại',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['restaurantName', 'slug'],
      properties: {
        restaurantName: { type: 'string', minLength: 2, maxLength: 120 },
        slug: {
          type: 'string',
          minLength: 3,
          maxLength: 63,
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
        },
        timezone: { type: 'string', default: 'Asia/Ho_Chi_Minh' },
      },
    },
  })
  createRestaurant(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(createRestaurantSchema)) input: CreateRestaurantInput,
  ) {
    return this.tenancy.create(staff, input);
  }
  @Post('switch-restaurant')
  @HttpCode(200)
  @ApiCookieAuth('df_access')
  @ApiOperation({
    summary: 'Chuyển sang membership hợp lệ, revoke phiên nguồn và đặt cookies phiên đích',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['restaurantId'],
      properties: { restaurantId: { type: 'string', format: 'uuid' } },
    },
  })
  async switchRestaurant(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(switchRestaurantSchema)) input: { restaurantId: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = await this.auth.switchRestaurant(staff, input.restaurantId);
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
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(
      (request.cookies as Record<string, unknown> | undefined)?.df_refresh,
    );
    this.clearCookies(response);
  }
  @Get('me')
  @ApiCookieAuth('df_access')
  @ApiOperation({ summary: 'Thông tin user, membership và restaurant scope hiện tại' })
  me(@CurrentStaff() staff: StaffPrincipal): StaffPrincipal {
    return staff;
  }
  @Public()
  @Post('request-verification')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async requestVerification(@Body(new ZodPipe(emailRequestSchema)) input: { email: string }) {
    await this.accounts.request(input.email, 'VERIFY_EMAIL');
    return { accepted: true };
  }
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async forgot(@Body(new ZodPipe(emailRequestSchema)) input: { email: string }) {
    await this.accounts.request(input.email, 'RESET_PASSWORD');
    return { accepted: true };
  }
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async verifyEmail(@Body(new ZodPipe(accountTokenSchema)) input: { token: string }) {
    await this.accounts.verify(input.token);
    return { accepted: true };
  }
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async resetPassword(
    @Body(new ZodPipe(resetPasswordSchema)) input: { token: string; password: string },
  ) {
    await this.accounts.reset(input.token, input.password);
    return { accepted: true };
  }
  @Get('security')
  security(@CurrentStaff() staff: StaffPrincipal) {
    return this.accounts.status(staff.userId);
  }
  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(changePasswordSchema))
    input: { currentPassword: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.accounts.change(
      staff.userId,
      staff.authSessionId,
      false,
      input.currentPassword,
      input.password,
    );
    this.clearCookies(response);
    return { accepted: true };
  }
}
