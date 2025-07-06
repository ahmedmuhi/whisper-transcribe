/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for better performance than jsdom
    environment: 'happy-dom',
    
    // Setup files - equivalent to Jest's setupFilesAfterEnv
    setupFiles: ['./tests/vitest-setup.js'],
    
    // Test file patterns - only Vitest files for coverage
    include: ['**/tests/**/*.vitest.js'],
    
    // Timeout configuration
    testTimeout: 10000,
    
    // Coverage configuration with 80% safety net thresholds
    coverage: {
      provider: 'v8',
      include: [
        'js/**/*.js'
      ],
      exclude: [
        'js/main.js',
        '**/node_modules/**',
        '**/tests/**',
        '**/coverage/**',
        '**/*.config.js',
        '**/*.test.js',
        '**/*.vitest.js'
      ],
      reporter: ['text', 'html', 'lcov', 'json', 'clover'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 70,
        lines: 85
      },
      // Clean coverage directory before each run
      clean: true,
      // Enable all coverage types for comprehensive reporting
      all: true
    },
    
    // Enable verbose output
    reporter: 'verbose',
    
    // Global configuration
    globals: true
  },
  
  // Module resolution to match Jest's moduleNameMapper
  resolve: {
    alias: {
      '@': new URL('./js', import.meta.url).pathname
    }
  }
});
