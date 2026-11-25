import { expect, test as setup } from '@playwright/test';
import { ADMIN, CSRF, TECNICO_STATE } from './helpers';

// Login do técnico pela API, uma vez só; os testes da área logada reaproveitam o cookie de sessão.
setup('login do técnico', async ({ request }) => {
  const res = await request.post('/api/auth/login', { headers: CSRF, data: ADMIN });
  expect(res.ok(), await res.text()).toBeTruthy();
  await request.storageState({ path: TECNICO_STATE });
});
