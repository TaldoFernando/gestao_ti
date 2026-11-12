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

// ponytail: token no localStorage; trocar por cookie httpOnly se houver XSS de terceiros no front.
const KEY = 'ti-session';

export function session(): { token: string; user: User } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem(KEY);
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
  const token = session()?.token;
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (json !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(`/api${path}`, { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (res.status === 401 && token) logout();
  if (res.status === 204) return { body: undefined as T, res };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new ApiError(res.status, msg ?? 'Algo deu errado. Tente de novo.');
  }
  return { body, res };
}

export async function login(email: string, password: string) {
  const data = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', json: { email, password } });
  localStorage.setItem(KEY, JSON.stringify(data));
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
