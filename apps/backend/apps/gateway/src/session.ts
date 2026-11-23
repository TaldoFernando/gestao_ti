import type { Request, Response } from 'express';

export const COOKIE = 'ti-session';
export const cookieOptions = () => ({
  httpOnly: true, secure: process.env.COOKIE_SECURE !== 'false', sameSite: 'strict' as const,
  path: '/api', maxAge: 8 * 60 * 60 * 1000,
});

export function sessionToken(req: Request): string | undefined {
  return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}

// Cabeçalho não simples exige preflight. O gateway não habilita CORS.
// Origin e Fetch Metadata também barram páginas externas, inclusive subdomínios.
export function csrfAllowed(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.get('x-requested-with') !== 'gestao-ti') return false;
  if (req.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.get('origin');
  const expected = process.env.PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`;
  return !origin || origin === new URL(expected).origin;
}

export function clearSession(res: Response) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE, options);
}
