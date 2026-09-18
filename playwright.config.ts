import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000/th/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Real provider keys in .env.local must never be used by the suite (cost, and the fixtures
    // are blank documents); every adapter runs its fake.
    env: {
      ...process.env,
      EXTRACTION_PROVIDER: 'fake',
      TTS_PROVIDER: 'fake',
      NOTIFY_PROVIDER: 'fake',
      VAPI_PROVIDER: 'fake',
      QUESTION_GEN_PROVIDER: 'fake',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
