import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@prefeitura.example',
  password: process.env.ADMIN_PASSWORD ?? 'troque-esta-senha',
};
export const TECNICO_STATE = '.auth/tecnico.json';

// Toda escrita na API exige o cabeçalho anti-CSRF (ver session.ts no gateway).
export const CSRF = { 'X-Requested-With': 'gestao-ti' };

/** Sufixo único: os testes podem rodar de novo no mesmo banco sem colidir. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
}

/** Abre um chamado pela API pública, como o formulário faz (multipart). */
export async function openTicket(request: APIRequestContext, title: string) {
  const res = await request.post('/api/tickets', {
    headers: CSRF,
    multipart: { requesterName: 'Maria Teste', email: 'maria@exemplo.com', whatsapp: '(83) 99999-0000', title, description: 'Aberto pelo teste de interface.' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).protocol as string;
}

export async function post<T>(request: APIRequestContext, path: string, data: object): Promise<T> {
  const res = await request.post(`/api${path}`, { headers: CSRF, data });
  expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
  return res.json();
}
