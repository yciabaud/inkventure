import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Smoke test of the live site (S7.2), run by hand: `npm run test:production`, or the Production smoke workflow.
// Unlike tests/e2e/, it uses the real network: the deployed app, its catalogue and ebooks, IFDB covers and the
// IF Archive. PROD_URL overrides the address (default: the ebook's host, the app's public address).
const host = (JSON.parse(readFileSync('ebook/config.json', 'utf8')) as { host: string }).host;
const baseURL = (process.env.PROD_URL || host).replace(/\/?$/, '/');

const ereader = {
  hasTouch: true,
  isMobile: false,
  reducedMotion: 'reduce' as const,
  viewport: { width: 600, height: 800 },
  deviceScaleFactor: 1,
  locale: 'en-US',
};

export default defineConfig({
  testDir: 'tests/production',
  forbidOnly: !!process.env.CI,
  // The network is real: one retry absorbs a slow response, a second failure is real.
  retries: 1,
  timeout: 90_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'ereader-small-chromium', use: { ...devices['Desktop Chrome'], ...ereader } },
    { name: 'ereader-small-webkit', use: { ...devices['Desktop Safari'], ...ereader } },
  ],
});
