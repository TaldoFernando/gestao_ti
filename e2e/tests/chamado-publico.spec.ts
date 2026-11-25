import { expect, test } from '@playwright/test';
import { unique } from './helpers';

test('cidadão abre um chamado sem login e acompanha pelo protocolo', async ({ page }) => {
  const title = `Impressora não liga ${unique()}`;
  await page.goto('/abrir-chamado');
  await page.getByLabel('Seu nome').fill('Maria da Silva');
  await page.getByLabel('E-mail').fill('maria@exemplo.com');
  await page.getByLabel('WhatsApp com DDD').fill('(83) 99999-0000');
  await page.getByLabel('Resumo do problema').fill(title);
  await page.getByLabel('Descrição').fill('Desde ontem a impressora da recepção não liga.');
  await page.getByRole('button', { name: 'Enviar chamado' }).click();

  const protocol = page.getByText(/^JAC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(protocol).toBeVisible();
  const code = (await protocol.textContent())!.trim();

  await page.getByRole('button', { name: 'Acompanhar chamado' }).click();
  await expect(page).toHaveURL(new RegExp(`/acompanhar/${code}$`));
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Aberto', { exact: true })).toBeVisible();

  // Consulta digitando o protocolo, como quem volta outro dia.
  await page.goto('/acompanhar');
  await page.getByLabel('Protocolo').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('protocolo que não existe mostra erro', async ({ page }) => {
  await page.goto('/acompanhar/JAC-ZZZZ-ZZZZ');
  await expect(page.getByRole('alert')).toBeVisible();
});
