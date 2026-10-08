import { Module } from '@nestjs/common';
import { PublicTablesController, TablesController } from './tables.controller';
import { TablesService } from './tables.service';
@Module({ controllers: [TablesController, PublicTablesController], providers: [TablesService] })
export class TablesModule {}
