import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the exported web build (dist/) served statically.
// Build it first with `npm run build:web`.
export default defineConfig({
  testDir: './e2e',
  // 300s: the full-race playthrough sails a real Round-the-Island in real time,
  // and the fleet-friction calibration made that race a genuine contest rather
  // than a procession — more decisions actually dock, and each one holds the sim
  // until the spec answers it. The race itself is unchanged in length.
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx serve -s dist -l 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
