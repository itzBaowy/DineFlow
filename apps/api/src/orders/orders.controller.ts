import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  admissionInputSchema,
  createOrderInputSchema,
  type CreateOrderInput,
  type StaffPrincipal,
} from '@dineflow/shared';
import { Public, Roles } from '../auth/policies';
import { CurrentStaff } from '../auth/current-staff';
import { ZodPipe } from '../common/zod.pipe';
import { CONFIG, type AppConfig } from '../config/env';
import { OrdersService } from './orders.service';

function guestToken(request: Request): string | undefined {
  const token: unknown = (request.cookies as Record<string, unknown> | undefined)?.df_guest;
  return typeof token === 'string' ? token : undefined;
}
@Public()
@ApiTags('Customer ordering')
@ApiCookieAuth('df_guest')
@Controller('public/tables/:code')
export class PublicOrdersController {
  constructor(
    private readonly orders: OrdersService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  @Get('menu') menu(@Param('code') code: string) {
    return this.orders.menu(code);
  }
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('guest')
  async admit(
    @Param('code') code: string,
    @Req() request: Request,
    @Body(new ZodPipe(admissionInputSchema)) input: { diningSessionId: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.orders.admit(code, input.diningSessionId, guestToken(request));
    response.cookie('df_guest', result.token, {
      path: this.orders.cookiePath(code),
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.COOKIE_SECURE,
      expires: result.guest.expiresAt,
    });
    return result.guest;
  }
  @Get('guest') me(@Param('code') code: string, @Req() request: Request) {
    return this.orders.me(code, guestToken(request));
  }
  @Get('orders') history(@Param('code') code: string, @Req() request: Request) {
    return this.orders.history(code, guestToken(request));
  }
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('orders')
  create(
    @Param('code') code: string,
    @Req() request: Request,
    @Body(new ZodPipe(createOrderInputSchema)) input: CreateOrderInput,
  ) {
    return this.orders.create(code, input, guestToken(request));
  }
}
@Roles('OWNER', 'MANAGER', 'WAITER', 'CASHIER')
@ApiTags('Current dining orders')
@ApiCookieAuth('df_access')
@Controller('dining-sessions')
export class SessionOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get(':id/orders') list(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.staffOrders(staff, id);
  }
}
