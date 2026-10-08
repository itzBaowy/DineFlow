import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, unknown>): Promise<string> {
    const ip = await super.getTracker(request);
    const body = request.body;
    const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    return email ? `${ip}:${createHash('sha256').update(email).digest('hex')}` : ip;
  }
}
