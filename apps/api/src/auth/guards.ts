import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@dineflow/shared';
import { AuthService } from './auth.service';
import { ALLOWED_ROLES, IS_PUBLIC } from './policies';
import type { StaffRequest } from './auth.types';
import { CONFIG, type AppConfig } from '../config/env';

@Injectable()
export class MutationGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<StaffRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.get('origin');
    if (request.get('x-dineflow-client') !== 'web' || (origin && origin !== this.config.APP_ORIGIN) || request.get('sec-fetch-site') === 'cross-site') throw new ForbiddenException('Nguồn yêu cầu không được phép');
    if (!request.is('application/json')) throw new ForbiddenException('Yêu cầu phải là application/json');
    return true;
  }
}

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const request = ctx.switchToHttp().getRequest<StaffRequest>();
    const token: unknown = (request.cookies as Record<string, unknown> | undefined)?.df_access;
    if (typeof token !== 'string') throw new UnauthorizedException('Vui lòng đăng nhập');
    request.staff = await this.auth.authenticate(token);
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ALLOWED_ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const staff = ctx.switchToHttp().getRequest<StaffRequest>().staff;
    if (!staff || !roles.includes(staff.role)) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    return true;
  }
}
