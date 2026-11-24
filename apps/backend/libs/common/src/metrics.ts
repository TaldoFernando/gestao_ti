import { createServer, type Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

// Métricas no formato do Prometheus (issue #14). Cada processo expõe as suas numa porta interna (9464),
// fora do gateway: o Prometheus lê direto na rede do Compose e nada disso fica público pelo nginx.
export const registry = new Registry();
registry.setDefaultLabels({ service: process.env.SERVICE_NAME ?? 'unknown' });
collectDefaultMetrics({ register: registry });

const requests = new Counter({
  name: 'http_requests_total',
  help: 'Requisições HTTP atendidas, por método, rota e status.',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});
const duration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Tempo de resposta HTTP em segundos.',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

const ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[0-9a-f]{16,}|JAC-[\w-]+)$/i;

/** Troca ids, números e protocolos por ":id", para o número de séries não crescer com os dados. */
export function routeLabel(url: string) {
  return url.split('?')[0].split('/').map((part) => (ID.test(part) ? ':id' : part)).join('/') || '/';
}

/** Middleware Express: conta e cronometra cada requisição. O healthcheck do Docker fica de fora. */
export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  const end = duration.startTimer();
  res.on('finish', () => {
    // 404 agrupado: varredura de URLs aleatórias não pode criar uma série por URL.
    const route = res.statusCode === 404 ? 'nao_encontrada' : routeLabel(req.originalUrl);
    if (route === '/api/health') return;
    requests.inc({ method: req.method, route, status: String(res.statusCode) });
    end({ method: req.method, route });
  });
  next();
}

/** Servidor só de métricas: GET /metrics na porta METRICS_PORT (padrão 9464). */
export function startMetricsServer(port = Number(process.env.METRICS_PORT ?? 9464)): Server {
  return createServer((req, res) => {
    if (req.url !== '/metrics') {
      res.statusCode = 404;
      return void res.end();
    }
    registry.metrics().then((body) => {
      res.setHeader('content-type', registry.contentType);
      res.end(body);
    }, () => {
      res.statusCode = 500;
      res.end();
    });
  }).listen(port);
}
