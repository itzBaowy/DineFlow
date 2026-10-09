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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly tenancy: TenancyService,
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
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Thông tin nhân viên, không trả access/refresh token',
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
  restaurants(@CurrentStaff() staff: StaffPrincipal) {
    return this.auth.restaurants(staff.userId);
  }
  @Roles('OWNER')
  @Post('restaurants')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  createRestaurant(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(createRestaurantSchema)) input: CreateRestaurantInput,
  ) {
    return this.tenancy.create(staff, input);
  }
  @Post('switch-restaurant')
  @HttpCode(200)
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
}
