import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../auth/policies';

@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live')
  @ApiOperation({ summary: 'Process liveness' })
  live() { return { status: 'ok' }; }
  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL readiness' })
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok', database: 'up' }; }
    catch { throw new ServiceUnavailableException('Database chưa sẵn sàng'); }
  }
}
