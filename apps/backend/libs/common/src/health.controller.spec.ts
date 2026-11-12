import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from './health.controller';

it('GET /health responde ok', async () => {
  const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
  const app = mod.createNestApplication();
  await app.init();
  await request(app.getHttpServer()).get('/health').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
  await app.close();
});
