import { defineConfig, devices, type Project } from '@playwright/test';

const isCI = !!process.env.CI;
// WebKit cannot be installed in every dev environment; CI always runs it.
const withWebKit = isCI || process.env.PW_WEBKIT === '1';
const port = 4173;

const ereader = {
  hasTouch: true,
  isMobile: false,
  reducedMotion: 'reduce' as const,
};

const ereaderSizes = {
  'ereader-small': { width: 600, height: 800 },
  'ereader-large': { width: 1072, height: 1448 },
};

const engines = {
  chromium: devices['Desktop Chrome'],
  webkit: devices['Desktop Safari'],
};

const projects: Project[] = [];
for (const [name, viewport] of Object.entries(ereaderSizes)) {
  for (const [engine, device] of Object.entries(engines)) {
    if (engine === 'webkit' && !withWebKit) continue;
    projects.push({
      name: `${name}-${engine}`,
      use: { ...device, ...ereader, viewport, deviceScaleFactor: 1 },
    });
  }
}
projects.push({ name: 'desktop', use: { ...devices['Desktop Chrome'] } });

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects,
  // Tests run against the production build (modern + legacy bundles), not the dev server.
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
