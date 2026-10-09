import { Module } from '@nestjs/common';
import { PlatformAuthController, PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './platform.guard';
import { SecurityModule } from '../security/security.module';
@Module({
  imports: [SecurityModule],
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
