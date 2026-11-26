import { authorize, createRateLimiter, User } from './access';

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
  expect(authorize('GET', '/api/sectors/s/report.pdf', responsavel)).toBeNull(); // termo em PDF (escopo no asset-service)
  expect(authorize('POST', '/api/equipment', responsavel)).toBe(403);
  expect(authorize('GET', '/api/users', responsavel)).toBe(403);
  expect(authorize('GET', '/api/tickets', responsavel)).toBe(403);
});

it('técnico acessa tudo', () => {
  expect(authorize('DELETE', '/api/sectors/x', tecnico)).toBeNull();
  expect(authorize('POST', '/api/users', tecnico)).toBeNull();
});

it('compartilha o limite de login entre instâncias do gateway', async () => {
  const buckets = new Map<string, number>();
  const increment = jest.fn(async (key: string, windowMs: number) => {
    expect(windowMs).toBe(60_000);
    const count = (buckets.get(key) ?? 0) + 1;
    buckets.set(key, count);
    return count;
  });
  const gatewayA = createRateLimiter(increment);
  const gatewayB = createRateLimiter(increment);

  for (let i = 0; i < 3; i++) expect(await gatewayA('1.1.1.1', 'POST', '/api/auth/login')).toBe(false);
  expect(await gatewayB('1.1.1.1', 'POST', '/api/auth/login')).toBe(false);
  expect(await gatewayB('1.1.1.1', 'POST', '/api/auth/login')).toBe(false);
  expect(await gatewayA('1.1.1.1', 'POST', '/api/auth/login')).toBe(true);
  expect(await gatewayA('2.2.2.2', 'POST', '/api/auth/login')).toBe(false);
  expect(increment).toHaveBeenCalledWith('gestao-ti:rate-limit:1.1.1.1:0', 60_000);
});
