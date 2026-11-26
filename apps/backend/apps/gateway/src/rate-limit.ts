import { createClient } from 'redis';
import { createRateLimiter } from './access';

const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.on('error', (error) => console.error(`Redis do rate limit: ${error.message}`));

const increment: Parameters<typeof createRateLimiter>[0] = async (key, windowMs) => {
  const result = await redis.eval(
    "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count",
    { keys: [key], arguments: [String(windowMs)] },
  );
  return Number(result);
};

export const rateLimited = createRateLimiter(increment);

export function connectRateLimiter() {
  return redis.connect();
}

export async function closeRateLimiter() {
  if (redis.isOpen) await redis.quit().catch(() => undefined);
}
