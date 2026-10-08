import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { StaffRequest } from './auth.types';

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const staff = ctx.switchToHttp().getRequest<StaffRequest>().staff;
  if (!staff) throw new UnauthorizedException('Vui lòng đăng nhập');
  return staff;
});
