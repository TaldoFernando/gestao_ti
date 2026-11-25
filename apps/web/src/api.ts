export type Role = 'TECNICO' | 'RESPONSAVEL';
export type User = { sub: string; name: string; role: Role; sectorId: string | null };
export type Sector = {
  id: string;
  name: string;
  type: string;
  description: string;
  parentId: string | null;
};
export type Equipment = {
  id: string;
  name: string;
  type: string;
  assetTag: string | null;
  serial: string | null;
  ownership: 'PROPRIO' | 'ALUGADO';
  sectorId: string | null;
};

let activeSession: { user: User } | null = null;
// Remove tokens deixados por versões anteriores.
localStorage.removeItem('ti-session');
export const session = () => activeSession;

export async function restoreSession() {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (res.ok) activeSession = await res.json();
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  activeSession = null;
  location.assign('/login');
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  return (await send<T>(path, init)).body;
}

/** Lista paginada no servidor: o total vem no cabeçalho X-Total-Count. */
export async function apiPage<T>(path: string): Promise<{ items: T[]; total: number }> {
  const { body, res } = await send<T[]>(path);
  return { items: body, total: Number(res.headers.get('x-total-count') ?? body.length) };
}

async function send<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ body: T; res: Response }> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('x-requested-with', 'gestao-ti');
  if (json !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(`/api${path}`, { ...rest, credentials: 'same-origin', headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (res.status === 401 && activeSession) { activeSession = null; location.assign('/login'); }
  if (res.status === 204) return { body: undefined as T, res };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new ApiError(res.status, msg ?? 'Algo deu errado. Tente de novo.');
  }
  return { body, res };
}

/** Baixa um arquivo gerado no servidor (ex.: PDF do termo) com o cookie da sessão e o cabeçalho anti-CSRF. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'x-requested-with': 'gestao-ti' } });
  if (res.status === 401 && activeSession) { activeSession = null; location.assign('/login'); }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? 'Não foi possível gerar o arquivo. Tente de novo.');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function login(email: string, password: string) {
  const data = await api<{ user: User }>('/auth/login', { method: 'POST', json: { email, password } });
  activeSession = data;
}

// Caminho "Setor › Local", como no protótipo.
export function sectorPath(sectors: Sector[], id: string | null) {
  const s = sectors.find((x) => x.id === id);
  if (!s) return '';
  const parent = sectors.find((x) => x.id === s.parentId);
  return parent ? `${parent.name} › ${s.name}` : s.name;
}

/** Equipamentos de um setor principal, contando os locais vinculados. */
export function equipmentIn(sectorId: string, sectors: Sector[], equipment: Equipment[]) {
  const ids = new Set([sectorId, ...sectors.filter((s) => s.parentId === sectorId).map((s) => s.id)]);
  return equipment.filter((e) => e.sectorId && ids.has(e.sectorId));
}

export type Movement = { id: string; fromName: string | null; toName: string | null; byName: string; at: string };
export type AppUser = { id: string; name: string; email: string; role: Role; sectorId: string | null };
