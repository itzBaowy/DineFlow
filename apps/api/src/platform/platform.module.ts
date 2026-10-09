import { Module } from '@nestjs/common';
import { PlatformAuthController, PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './platform.guard';
@Module({
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
