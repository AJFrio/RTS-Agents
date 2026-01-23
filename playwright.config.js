const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'file://' + path.resolve(__dirname, 'index.html'),
  },
  webServer: {
    command: 'npx serve -l 3333 .',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
  },
});
