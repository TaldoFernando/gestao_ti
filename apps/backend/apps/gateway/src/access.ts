export type Role = 'TECNICO' | 'RESPONSAVEL';
export type User = { sub: string; role: Role; sectorId: string | null; name: string };

const PUBLIC: [string, RegExp][] = [
  ['POST', /^\/api\/auth\/login$/],
  ['POST', /^\/api\/tickets$/],                    // cidadão abre chamado sem login
  ['GET', /^\/api\/tickets\/protocol\/[\w-]+$/],   // cidadão acompanha pelo protocolo
  ['GET', /^\/api\/health$/],
];

// Responsável do setor só consulta inventário (escopo por setor na etapa 7).
const RESPONSAVEL_READS = /^\/api\/(sectors|equipment)(\/|$)/;

export function isPublic(method: string, path: string) {
  return PUBLIC.some(([m, re]) => m === method && re.test(path));
}

/** null = liberado; senão o status HTTP a devolver. */
export function authorize(method: string, path: string, user: User | null): 401 | 403 | null {
  if (isPublic(method, path)) return null;
  if (!user) return 401;
  if (user.role === 'TECNICO') return null;
  return method === 'GET' && RESPONSAVEL_READS.test(path) ? null : 403;
}

// Janela fixa por IP e grupo de rota.
// ponytail: memória de um processo só; Redis se o gateway tiver mais de uma réplica.
const LIMITS: [RegExp, number][] = [
  [/^POST \/api\/auth\/login$/, 5],
  [/^POST \/api\/tickets$/, 10],
  [/./, 300],
];
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(ip: string, method: string, path: string, now = Date.now()) {
  const key = `${method} ${path}`;
  const index = LIMITS.findIndex(([re]) => re.test(key));
  const bucket = `${ip}|${index}`;
  const entry = hits.get(bucket);
  if (!entry || entry.resetAt <= now) {
    hits.set(bucket, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  return ++entry.count > LIMITS[index][1];
}
