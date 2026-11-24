import { expect, test } from '@playwright/test';
import { TECNICO_STATE, openTicket, unique } from './helpers';

test.use({ storageState: TECNICO_STATE });

test('técnico assume, responde e resolve um chamado; o cidadão vê a resposta', async ({ page, request }) => {
  const title = `Sem internet no setor ${unique()}`;
  const protocol = await openTicket(request, title);

  await page.goto('/chamados');
  await page.getByLabel('Buscar').fill(protocol);
  await page.getByRole('link', { name: new RegExp(protocol) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Assumir chamado' }).click();
  await expect(page.getByRole('button', { name: 'Devolver para a fila' })).toBeVisible();
  await expect(page.getByText('com Administrador')).toBeVisible();

  const reply = `Reiniciamos o roteador do setor (${unique()}).`;
  await page.getByLabel('Mensagem').fill(reply);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(reply)).toBeVisible();

  const internal = `Nota só da equipe ${unique()}`;
  await page.getByRole('button', { name: 'Nota interna' }).click();
  await page.getByLabel('Mensagem').fill(internal);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText(internal)).toBeVisible();

  await page.getByLabel('Status').selectOption('RESOLVIDO');
  await expect(page.getByLabel('Status')).toHaveValue('RESOLVIDO');

  // Página pública: a resposta e o status aparecem; a nota interna não.
  await page.goto(`/acompanhar/${protocol}`);
  await expect(page.getByText('Resolvido', { exact: true })).toBeVisible();
  await expect(page.getByText(reply)).toBeVisible();
  await expect(page.getByText(internal)).toHaveCount(0);
});
