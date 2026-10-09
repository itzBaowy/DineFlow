import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PlatformService, type PlatformActor } from './platform.service';
export interface PlatformRequest extends Request {
  platform: PlatformActor;
}
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly service: PlatformService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    request.platform = await this.service.authenticate(
      (request.cookies as Record<string, unknown> | undefined)?.df_platform,
    );
    return true;
  }
}
