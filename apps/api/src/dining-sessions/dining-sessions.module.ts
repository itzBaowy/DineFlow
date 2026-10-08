import { Module } from '@nestjs/common';
import { DiningSessionsController } from './dining-sessions.controller';
import { DiningSessionsService } from './dining-sessions.service';
@Module({ controllers: [DiningSessionsController], providers: [DiningSessionsService] })
export class DiningSessionsModule {}
