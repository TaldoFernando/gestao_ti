import { expect, request as playwrightRequest, test } from '@playwright/test';
import { TECNICO_STATE, login, post, unique } from './helpers';

// Prepara pela API (como técnico) um setor com um equipamento e um responsável por ele.
test('responsável vê o inventário do próprio setor sem botões de edição', async ({ page, baseURL }) => {
  const id = unique();
  const api = await playwrightRequest.newContext({ baseURL, storageState: TECNICO_STATE });
  const sector = await post<{ id: string }>(api, '/sectors', { name: `Setor E2E ${id}`, type: 'Secretaria' });
  const other = await post<{ id: string }>(api, '/sectors', { name: `Outro setor E2E ${id}`, type: 'Secretaria' });
  const mine = `Computador do setor ${id}`;
  const foreign = `Computador de outro setor ${id}`;
  await post(api, '/equipment', { name: mine, type: 'Computador', sectorId: sector.id });
  await post(api, '/equipment', { name: foreign, type: 'Computador', sectorId: other.id });
  const email = `resp.${id}@prefeitura.example`;
  await post(api, '/users', { name: `Responsável ${id}`, email, password: 'senha-forte-1', role: 'RESPONSAVEL', sectorId: sector.id });
  await api.dispose();

  await login(page, email, 'senha-forte-1');
  const menu = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(menu.getByRole('link', { name: 'Equipamentos' })).toBeVisible();
  for (const hidden of ['Chamados', 'Usuários', 'Notificações']) await expect(menu.getByRole('link', { name: hidden })).toHaveCount(0);

  await menu.getByRole('link', { name: 'Equipamentos' }).click();
  await page.getByLabel('Buscar').fill(id);
  const row = page.getByRole('row', { name: new RegExp(mine) });
  await expect(row).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(foreign) })).toHaveCount(0); // outro setor não aparece

  await expect(row.getByRole('button', { name: 'Histórico' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Excluir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cadastrar equipamento' })).toHaveCount(0);

  // O termo de responsabilidade do próprio setor abre (issue #20).
  await page.goto(`/setores/${sector.id}/relatorio`);
  await expect(page.getByRole('button', { name: 'Baixar PDF' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^termo-.*\.pdf$/);
});
