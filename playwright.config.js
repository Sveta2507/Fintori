// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  timeout: 15000,
});