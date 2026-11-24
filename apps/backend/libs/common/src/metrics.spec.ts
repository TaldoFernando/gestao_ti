import express from 'express';
import request from 'supertest';
import type { AddressInfo } from 'node:net';
import { httpMetrics, registry, routeLabel, startMetricsServer } from './metrics';

it('troca ids, números e protocolos por :id', () => {
  expect(routeLabel('/api/tickets/3f2a1c9e-1b2c-4d5e-8f90-123456789abc/events?x=1')).toBe('/api/tickets/:id/events');
  expect(routeLabel('/api/tickets/protocol/JAC-7K2A-91QX')).toBe('/api/tickets/protocol/:id');
  expect(routeLabel('/api/notifications/dlq/a1b2c3d4e5f60718')).toBe('/api/notifications/dlq/:id');
  expect(routeLabel('/api/tickets?page=2')).toBe('/api/tickets');
});

it('conta as requisições por rota e status, sem o healthcheck e sem uma série por URL desconhecida', async () => {
  const app = express();
  app.use(httpMetrics);
  app.get('/api/sectors/:id', (_req, res) => res.json({}));
  app.get('/api/health', (_req, res) => res.json({}));
  await request(app).get('/api/sectors/3f2a1c9e-1b2c-4d5e-8f90-123456789abc').expect(200);
  await request(app).get('/api/health').expect(200);
  await request(app).get('/qualquer/coisa/123').expect(404);

  const text = await registry.metrics();
  expect(text).toMatch(/http_requests_total\{method="GET",route="\/api\/sectors\/:id",status="200",service="[^"]+"\} 1/);
  expect(text).toMatch(/route="nao_encontrada",status="404"/);
  expect(text).not.toContain('route="/api/health"');
});

it('expõe /metrics no formato do Prometheus e nada além disso', async () => {
  const server = startMetricsServer(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const res = await fetch(`${url}/metrics`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('process_cpu_seconds_total');
    expect((await fetch(`${url}/outra`)).status).toBe(404);
  } finally {
    server.close();
  }
});
