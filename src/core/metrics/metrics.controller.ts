import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SkipResponseTransform } from '../../common/decorators/skip-response-transform.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint. Public, un-throttled, and exempt from the
 * response envelope — it must return raw exposition-format text. Gated by
 * METRICS_ENABLED (returns 404 when disabled).
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@SkipResponseTransform()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  private readonly enabled: boolean;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('metrics.enabled', true);
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Res({ passthrough: true }) res: Response): Promise<string> {
    if (!this.enabled) {
      throw new NotFoundException();
    }
    res.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.metrics();
  }
}
