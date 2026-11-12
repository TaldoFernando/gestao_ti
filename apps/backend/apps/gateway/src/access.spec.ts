import { authorize, rateLimited, User } from './access';

const tecnico: User = { sub: '1', role: 'TECNICO', sectorId: null, name: 'T' };
const responsavel: User = { sub: '2', role: 'RESPONSAVEL', sectorId: 's', name: 'R' };

it('rotas públicas não pedem login', () => {
  expect(authorize('POST', '/api/tickets', null)).toBeNull();
  expect(authorize('GET', '/api/tickets/protocol/2026-0001', null)).toBeNull();
  expect(authorize('POST', '/api/auth/login', null)).toBeNull();
});

it('o resto exige token', () => {
  expect(authorize('GET', '/api/equipment', null)).toBe(401);
  expect(authorize('GET', '/api/tickets', null)).toBe(401);
});

it('responsável só lê inventário', () => {
  expect(authorize('GET', '/api/equipment', responsavel)).toBeNull();
  expect(authorize('POST', '/api/equipment', responsavel)).toBe(403);
  expect(authorize('GET', '/api/users', responsavel)).toBe(403);
  expect(authorize('GET', '/api/tickets', responsavel)).toBe(403);
});

it('técnico acessa tudo', () => {
  expect(authorize('DELETE', '/api/sectors/x', tecnico)).toBeNull();
  expect(authorize('POST', '/api/users', tecnico)).toBeNull();
});

it('login bloqueia na 6ª tentativa por minuto e libera depois', () => {
  const t = 1_000_000;
  for (let i = 0; i < 5; i++) expect(rateLimited('1.1.1.1', 'POST', '/api/auth/login', t)).toBe(false);
  expect(rateLimited('1.1.1.1', 'POST', '/api/auth/login', t)).toBe(true);
  expect(rateLimited('2.2.2.2', 'POST', '/api/auth/login', t)).toBe(false);
  expect(rateLimited('1.1.1.1', 'POST', '/api/auth/login', t + 60_000)).toBe(false);
});
