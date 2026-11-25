import { expect, test } from '@playwright/test';
import { ADMIN, login } from './helpers';

test('senha errada mostra o erro e não entra', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(ADMIN.email);
  await page.getByLabel('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('técnico entra, vê o menu completo e sai', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  const menu = page.getByRole('navigation', { name: 'Navegação principal' });
  for (const item of ['Visão geral', 'Chamados', 'Equipamentos', 'Setores', 'Usuários', 'Notificações']) {
    await expect(menu.getByRole('link', { name: item })).toBeVisible();
  }

  // Recarregar a página mantém a sessão (cookie httpOnly, issue #12).
  await page.reload();
  await expect(menu).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  // Sem sessão, a área logada volta para o login.
  await page.goto('/equipamentos');
  await expect(page).toHaveURL(/\/login$/);
});
