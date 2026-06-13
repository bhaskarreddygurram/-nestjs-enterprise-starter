import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisHealthIndicator } from './indicators/redis.health';

/**
 * Health endpoints used by container orchestrators and uptime checks.
 *
 *  - `GET /health`            liveness: is the process up and responding?
 *  - `GET /health/readiness`  readiness: can it serve traffic (DB + Redis)?
 *
 * Liveness intentionally avoids dependency checks so a transient DB blip does
 * not cause the orchestrator to kill an otherwise-healthy process.
 */
@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Service is alive' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOkResponse({ description: 'Service and its dependencies are ready' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
