import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { HealthController, httpMetrics, startMetricsServer } from '@app/common';
import { deadLetters } from './dlq';
import { COOKIE, cookieOptions, sessionToken, csrfAllowed, clearSession } from './session';
import { authorize, type User } from './access';
import { closeRateLimiter, connectRateLimiter, rateLimited } from './rate-limit';

const ASSET = process.env.ASSET_SERVICE_URL ?? 'http://localhost:3002';
const TICKET = process.env.TICKET_SERVICE_URL ?? 'http://localhost:3001';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET não definido.');
const jwt = new JwtService({ secret, signOptions: { expiresIn: '8h' } });

// Prefixo da rota → serviço. O gateway não lê o corpo; repassa o stream (serve para multipart depois).
const routes: [RegExp, string][] = [
  [/^\/api\/(sectors|equipment|users)(\/|$)/, ASSET],
  [/^\/api\/tickets(\/|$)/, TICKET],
];

function currentUser(req: Request): User | null {
  const token = sessionToken(req);
  if (!token) return null;
  try {
    return jwt.verify<User>(token);
  } catch {
    return null;
  }
}

async function guard(req: Request, res: Response, next: NextFunction) {
  let limited: boolean;
  try {
    limited = await rateLimited(req.ip ?? '', req.method, req.path);
  } catch {
    res.status(503).json({ message: 'Proteção contra excesso de requisições temporariamente indisponível.' });
    return;
  }
  if (limited) {
    res.status(429).json({ message: 'Muitas requisições. Tente de novo em um minuto.' });
    return;
  }
  if (!csrfAllowed(req)) return void res.status(403).json({ message: 'Origem ou cabeçalho de proteção CSRF inválido.' });
  const user = currentUser(req);
  const denied = authorize(req.method, req.path, user);
  if (denied) {
    res.status(denied).json({ message: denied === 401 ? 'Faça login para continuar.' : 'Acesso não permitido para o seu perfil.' });
    return;
  }
  // Os serviços confiam nestes cabeçalhos; nunca aceitar os que vêm do cliente.
  for (const h of ['x-user-id', 'x-user-role', 'x-user-sector', 'x-user-name']) delete req.headers[h];
  if (user) Object.assign(req.headers, { 'x-user-id': user.sub, 'x-user-role': user.role, 'x-user-sector': user.sectorId ?? '', 'x-user-name': encodeURIComponent(user.name) });
  next();
}

async function login(req: Request, res: Response) {
  const upstream = await fetch(`${ASSET}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body ?? {}),
  }).catch(() => null);
  if (!upstream) return res.status(503).json({ message: 'Serviço temporariamente indisponível.' });
  const body = await upstream.json();
  if (!upstream.ok) return res.status(upstream.status).json(body);
  const user: User = { sub: body.id, role: body.role, sectorId: body.sectorId, name: body.name };
  res.cookie(COOKIE, jwt.sign(user), cookieOptions());
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user });
}

async function proxy(req: Request, res: Response, next: NextFunction) {
  const target = routes.find(([re]) => re.test(req.path))?.[1];
  if (!target) return next();
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await fetch(target + req.originalUrl, {
      method: req.method,
      headers: { ...Object.fromEntries(Object.entries(req.headers).filter(([key]) => !['cookie', 'authorization'].includes(key))) as Record<string, string>, host: new URL(target).host },
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

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // IP real vem do nginx. Atrás de mais um proxy (borda do blue-green, ADR 0008) são 2 saltos.
  app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(httpMetrics);
  app.use(guard);
  app.use('/api/auth/login', express.json(), (req: Request, res: Response, next: NextFunction) =>
    req.method === 'POST' ? login(req, res) : next());
  app.use('/api/auth/session', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-store');
    const user = currentUser(req);
    return user ? res.json({ user }) : res.status(401).json({ message: 'Sessão expirada.' });
  });
  app.use('/api/auth/logout', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    clearSession(res);
    res.status(204).end();
  });
  app.use((req: Request, res: Response, next: NextFunction) => /^\/api\/notifications\/dlq(?:\/[a-f0-9]+)?$/.test(req.path) ? deadLetters(req, res) : next());
  app.use(proxy);
  app.setGlobalPrefix('api');
  return app;
}
if (require.main === module) {
  startMetricsServer();
  connectRateLimiter().then(async () => {
    const app = await createApp();
    app.enableShutdownHooks();
    process.once('SIGTERM', () => void closeRateLimiter());
    process.once('SIGINT', () => void closeRateLimiter());
    await app.listen(process.env.PORT ?? 3000);
  }).catch((error) => {
    console.error(`Falha ao iniciar o rate limit distribuído: ${error.message}`);
    process.exit(1);
  });
}
