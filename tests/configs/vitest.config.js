import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Корень проекта — два уровня вверх от tests/configs/
    root: path.resolve(__dirname, '../..'),
    include: ['tests/unit.test.js', 'tests/integration.test.js'],
    exclude: ['tests/e2e.spec.js', 'node_modules/**'],
  },
});