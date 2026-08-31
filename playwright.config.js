const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  // Each spec launches its own Electron instance; running them in parallel
  // contends for the single app instance and flakes on launch.
  workers: 1,
  use: {
    headless: true,
  },
});
