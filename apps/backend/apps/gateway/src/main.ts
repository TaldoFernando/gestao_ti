import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { HealthController } from '@app/common';
import { authorize, rateLimited, type User } from './access';

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
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    return jwt.verify<User>(token);
  } catch {
    return null;
  }
}

function guard(req: Request, res: Response, next: NextFunction) {
  if (rateLimited(req.ip ?? '', req.method, req.path)) {
    res.status(429).json({ message: 'Muitas requisições. Tente de novo em um minuto.' });
    return;
  }
  const user = currentUser(req);
  const denied = authorize(req.method, req.path, user);
  if (denied) {
    res.status(denied).json({ message: denied === 401 ? 'Faça login para continuar.' : 'Acesso não permitido para o seu perfil.' });
    return;
  }
  // Os serviços confiam nestes cabeçalhos; nunca aceitar os que vêm do cliente.
  for (const h of ['x-user-id', 'x-user-role', 'x-user-sector']) delete req.headers[h];
  if (user) Object.assign(req.headers, { 'x-user-id': user.sub, 'x-user-role': user.role, 'x-user-sector': user.sectorId ?? '' });
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
  res.json({ token: jwt.sign(user), user });
}

async function proxy(req: Request, res: Response, next: NextFunction) {
  const target = routes.find(([re]) => re.test(req.path))?.[1];
  if (!target) return next();
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const upstream = await fetch(target + req.originalUrl, {
      method: req.method,
      headers: { ...(req.headers as Record<string, string>), host: new URL(target).host },
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
  app.getHttpAdapter().getInstance().set('trust proxy', 1); // IP real vem do nginx
  app.use(guard);
  app.use('/api/auth/login', express.json(), (req: Request, res: Response, next: NextFunction) =>
    req.method === 'POST' ? login(req, res) : next());
  app.use(proxy);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
if (require.main === module) bootstrap();
