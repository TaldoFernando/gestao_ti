import { expect, test } from '@playwright/test';
import { TECNICO_STATE, unique } from './helpers';

test.use({ storageState: TECNICO_STATE });

test('técnico cadastra, edita e exclui um equipamento', async ({ page }) => {
  const id = unique();
  const name = `Monitor de teste ${id}`;
  const renamed = `Monitor renomeado ${id}`;
  const tag = `PAT-E2E-${id}`.slice(0, 40);

  await page.goto('/equipamentos');
  await page.getByRole('button', { name: 'Cadastrar equipamento' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Nome do equipamento').fill(name);
  await form.getByLabel('Tipo').fill('Monitor');
  await form.getByLabel('Nº de patrimônio').fill(tag);
  await form.getByRole('button', { name: 'Salvar equipamento' }).click();
  await expect(form).toBeHidden();

  await page.getByLabel('Buscar').fill(id);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(tag);

  await row.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog').getByLabel('Nome do equipamento').fill(renamed);
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar equipamento' }).click();
  const renamedRow = page.getByRole('row', { name: new RegExp(renamed) });
  await expect(renamedRow).toBeVisible();

  await renamedRow.getByRole('button', { name: 'Excluir' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText(renamed);
  await confirm.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('row', { name: new RegExp(id) })).toHaveCount(0);
  await expect(page.getByText('Nenhum equipamento encontrado')).toBeVisible();
});
