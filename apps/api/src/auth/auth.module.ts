import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MutationGuard, RolesGuard, StaffAuthGuard } from './guards';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { RegistrationService } from './registration.service';
import { TenancyService } from './tenancy.service';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    SecurityModule,
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    TenancyService,
    { provide: APP_GUARD, useClass: MutationGuard },
    { provide: APP_GUARD, useClass: AuthThrottlerGuard },
    { provide: APP_GUARD, useClass: StaffAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
