import { defineConfig } from '@playwright/test';

export default defineConfig({
  // testDir относительно этого файла → tests/configs/../ = tests/
  testDir: '..',
  testMatch: '**/*.spec.js',
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  timeout: 15000,
});