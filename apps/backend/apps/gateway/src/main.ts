import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { Readable } from 'node:stream';
import { HealthController } from '@app/common';

// Prefixo da rota → serviço. O gateway não lê o corpo; repassa o stream (serve para multipart depois).
const routes: [string, string][] = [
  ['/api/sectors', process.env.ASSET_SERVICE_URL ?? 'http://localhost:3002'],
  ['/api/equipment', process.env.ASSET_SERVICE_URL ?? 'http://localhost:3002'],
  ['/api/tickets', process.env.TICKET_SERVICE_URL ?? 'http://localhost:3001'],
];

export async function proxy(req: Request, res: Response, next: NextFunction) {
  const target = routes.find(([prefix]) => req.originalUrl === prefix || req.originalUrl.startsWith(prefix + '/') || req.originalUrl.startsWith(prefix + '?'));
  if (!target) return next();
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await fetch(target[1] + req.originalUrl, {
      method: req.method,
      headers: { ...(req.headers as Record<string, string>), host: new URL(target[1]).host },
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: 'half',
    } as RequestInit);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) res.setHeader(key, value);
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    // Serviço fora do ar não derruba o gateway (isolamento de falhas, ADR 01).
    res.status(503).json({ message: 'Serviço temporariamente indisponível.' });
  }
}

@Module({ controllers: [HealthController] })
export class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(proxy);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
if (require.main === module) bootstrap();
