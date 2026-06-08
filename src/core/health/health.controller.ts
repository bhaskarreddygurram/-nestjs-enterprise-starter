import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

/**
 * Health endpoints used by container orchestrators and uptime checks.
 *
 * Phase 0: process-level liveness. A successful response confirms the HTTP
 * layer and application context are up. Phase 1 extends this with PostgreSQL
 * and Redis readiness indicators (so it answers "can I serve traffic?", not
 * just "am I alive?").
 *
 * Note: memory-threshold checks are intentionally avoided as a liveness
 * signal — they cause a busy-but-healthy service to be reported as down.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Service is alive' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
