import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('exposes the Prometheus content type', () => {
    expect(service.contentType).toContain('text/plain');
  });

  it('includes default process metrics', async () => {
    const output = await service.metrics();
    expect(output).toContain('process_cpu_user_seconds_total');
  });

  it('records an HTTP request into the histogram + counter', async () => {
    service.recordHttpRequest('GET', '/api/v1/users', 200, 0.012);
    const output = await service.metrics();
    expect(output).toContain('http_request_duration_seconds');
    expect(output).toContain('http_requests_total');
    expect(output).toContain('route="/api/v1/users"');
    expect(output).toContain('status_code="200"');
  });
});
