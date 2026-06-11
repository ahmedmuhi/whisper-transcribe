/// <reference types="vitest" />
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/vitest-setup.js'],
    include: ['tests/**/*.vitest.js'],
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      exclude: ['js/main.js'],
      reporter: ['text', 'html', 'lcov', 'json'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 70,
        lines: 85
      },
      clean: true,
      all: true
    },
    reporter: ['verbose'],
    globals: true
  }
});
