// @ts-check
// Playwright config for the static game at the repo root.
// Run from this folder: `npm ci && npx playwright test` (see README.md).
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PW_PORT || 4173);
const BASE_URL = process.env.PW_BASE_URL || `http://127.0.0.1:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, '..');

// Use a preinstalled Chromium when the pinned @playwright/test build does not
// match the browsers on the machine (e.g. a sandbox with /opt/pw-browsers).
// On CI the workflow installs the matching browser, so this stays unset.
const launchOptions = process.env.PW_CHROMIUM_PATH
  ? { executablePath: process.env.PW_CHROMIUM_PATH }
  : {};

module.exports = defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : (process.env.CI ? 2 : 4),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['github']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The game registers a service worker (js/pwa-register.js). Its cache
    // would make runs order-dependent, so tests never let it install.
    serviceWorkers: 'block',
    launchOptions,
  },
  projects: [
    {
      // Pure Node checks of data/ and assets/ (no browser is launched).
      name: 'data',
      testMatch: /(data-integrity|sprite-registry)\.spec\.js$/,
    },
    {
      // Landscape phone (iPhone 14 Pro Max class) — the game's primary target.
      name: 'phone',
      testIgnore: /(data-integrity|sprite-registry)\.spec\.js$/,
      use: {
        browserName: 'chromium',
        viewport: { width: 932, height: 375 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        userAgent: devices['Pixel 7'].userAgent,
      },
    },
    {
      name: 'desktop',
      testIgnore: /(data-integrity|sprite-registry)\.spec\.js$/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    // Plain static server of the repo root: the game has no build step.
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory "${REPO_ROOT}"`,
    url: `${BASE_URL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
