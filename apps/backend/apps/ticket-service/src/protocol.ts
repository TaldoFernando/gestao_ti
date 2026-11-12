import { randomBytes } from 'node:crypto';

// Sem 0/O/1/I para o cidadão não errar ao digitar.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newProtocol() {
  const chars = [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `JAC-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export const PROTOCOL_ATTEMPTS = 5;

/** Erro do Prisma de valor único repetido (P2002) na coluna `protocol`. */
export function isProtocolCollision(e: unknown) {
  const err = e as { code?: string; meta?: { target?: unknown } } | null;
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes('protocol') : String(target ?? '').includes('protocol');
}

/**
 * Executa `create` com um protocolo novo e, se o banco recusar por protocolo repetido,
 * tenta de novo com outro. A transação inteira precisa estar dentro de `create`:
 * no Postgres, um erro aborta a transação, então cada tentativa abre uma nova.
 */
export async function withUniqueProtocol<T>(create: (protocol: string) => Promise<T>, attempts = PROTOCOL_ATTEMPTS, gen = newProtocol): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await create(gen());
    } catch (e) {
      if (!isProtocolCollision(e) || i >= attempts) throw e;
    }
  }
}
