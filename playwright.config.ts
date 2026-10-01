import { defineConfig } from '@playwright/test';

// Two checkouts on one machine each run their own stack: `PLAYWRIGHT_PORT=3100 pnpm test:e2e`
// keeps this suite off a dev server that belongs to the other one.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: process.env.CI ? `pnpm start -p ${port}` : `pnpm dev -p ${port}`,
    url: `http://localhost:${port}/th/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Real provider keys in .env.local must never be used by the suite (cost, and the fixtures
    // are blank documents); every adapter runs its fake.
    env: {
      ...process.env,
      EXTRACTION_PROVIDER: 'fake',
      TTS_PROVIDER: 'fake',
      NOTIFY_PROVIDER: 'fake',
      INTERVIEW_PROVIDER: 'fake',
      QUESTION_GEN_PROVIDER: 'fake',
      VECTOR_PROVIDER: 'fake',
      CATEGORY_MAP_PROVIDER: 'fake',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
