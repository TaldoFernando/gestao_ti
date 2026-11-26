export type Role = 'TECNICO' | 'RESPONSAVEL';
export type User = { sub: string; role: Role; sectorId: string | null; name: string };

const PUBLIC: [string, RegExp][] = [
  ['POST', /^\/api\/auth\/login$/],
  ['POST', /^\/api\/tickets$/],                    // cidadão abre chamado sem login
  ['GET', /^\/api\/tickets\/protocol\/[\w-]+$/],   // cidadão acompanha pelo protocolo
  ['GET', /^\/api\/health$/],
  ['GET', /^\/api\/auth\/session$/],
  ['POST', /^\/api\/auth\/logout$/],
  ['GET', /^\/api\/sectors$/],                     // lista de setores do formulário público
];

// Responsável do setor só consulta inventário (escopo por setor na etapa 7).
const RESPONSAVEL_READS = /^\/api\/(sectors|equipment)(\/|$)/;
const SELF_PROFILE = /^\/api\/users\/me$/;

export function isPublic(method: string, path: string) {
  return PUBLIC.some(([m, re]) => m === method && re.test(path));
}

/** null = liberado; senão o status HTTP a devolver. */
export function authorize(method: string, path: string, user: User | null): 401 | 403 | null {
  if (isPublic(method, path)) return null;
  if (!user) return 401;
  if (user.role === 'TECNICO') return null;
  return (method === 'GET' && RESPONSAVEL_READS.test(path)) || SELF_PROFILE.test(path) && ['GET', 'PATCH'].includes(method) ? null : 403;
}

// Janela fixa por IP e grupo de rota. O contador é fornecido por Redis para que
// todas as réplicas do gateway compartilhem o mesmo limite.
const LIMITS: [RegExp, number][] = [
  [/^POST \/api\/auth\/login$/, 5],
  [/^POST \/api\/tickets$/, 10],
  [/./, 300],
];

export type IncrementBucket = (key: string, windowMs: number) => Promise<number>;

export function createRateLimiter(increment: IncrementBucket) {
  return async (ip: string, method: string, path: string) => {
    // Só para o teste de carga medir a capacidade sem o limitador (ver docs/testes.md). Nunca em produção.
    if (process.env.RATE_LIMIT_OFF === '1') return false;
    const route = `${method} ${path}`;
    const index = LIMITS.findIndex(([re]) => re.test(route));
    const count = await increment(`gestao-ti:rate-limit:${ip}:${index}`, 60_000);
    return count > LIMITS[index][1];
  };
}
