import { defineConfig, devices } from '@playwright/test';

// Testes de interface (issue #13). Rodam contra o sistema inteiro já no ar: docker compose up -d --wait
// No CI o limitador de login fica desligado (RATE_LIMIT_OFF=1), porque todos os testes saem do mesmo IP.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Faz o login do técnico uma vez e guarda o cookie para os outros testes.
    { name: 'login', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['login'] },
  ],
});
