import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

process.env.JWT_SECRET = 'test-secret-only';
process.env.PUBLIC_URL = 'http://localhost:8080';
process.env.RATE_LIMIT_OFF = '1';
const { createApp } = require('./main');
const user = { id: 'test-user', role: 'RESPONSAVEL', sectorId: null, name: 'Pessoa' };
let app: INestApplication;
const originalFetch = global.fetch;
beforeAll(async () => { app = await createApp(); await app.init(); });
afterAll(async () => { await app.close(); global.fetch = originalFetch; });
beforeEach(() => {
  global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => ({
    ok: true,
    json: async () => String(input).includes('/api/auth/status/') ? { active: true } : user,
  } as Response));
});

it('login guarda JWT somente em cookie seguro e restaura sessão após recarregar', async () => {
  const res = await request(app.getHttpServer()).post('/api/auth/login').set('X-Requested-With', 'gestao-ti').send({ email: 'x@y.com', password: 'test' }).expect(200);
  expect(res.body.token).toBeUndefined();
  const cookie = res.headers['set-cookie'][0];
  expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Strict');
  expect(cookie).toContain('Path=/api');
  const session = await request(app.getHttpServer()).get('/api/auth/session').set('Cookie', cookie.split(';')[0]).expect(200);
  expect(session.body.user.sub).toBe(user.id);
  await request(app.getHttpServer()).get('/api/notifications/dlq').set('Cookie', cookie.split(';')[0]).expect(403);
  const logout = await request(app.getHttpServer()).post('/api/auth/logout').set('X-Requested-With', 'gestao-ti').expect(204);
  expect(logout.headers['set-cookie'][0]).toContain('ti-session=;');
});
it('recusa CSRF em login, logout, multipart público e alterações autenticadas', async () => {
  for (const path of ['/api/auth/login', '/api/auth/logout', '/api/tickets', '/api/equipment']) {
    await request(app.getHttpServer()).post(path).expect(403);
    await request(app.getHttpServer()).post(path).set('X-Requested-With', 'gestao-ti').set('Origin', 'https://evil.example').expect(403);
  }
  expect(global.fetch).not.toHaveBeenCalled();
});
it('aceita a origem configurada e rejeita cookies inválidos e Bearer legado', async () => {
  await request(app.getHttpServer()).post('/api/auth/login').set('X-Requested-With', 'gestao-ti').set('Origin', 'http://localhost:8080').send({}).expect(200);
  await request(app.getHttpServer()).get('/api/equipment').set('Cookie', 'ti-session=invalid').expect(401);
  await request(app.getHttpServer()).get('/api/equipment').set('Authorization', 'Bearer invalid').expect(401);
});
