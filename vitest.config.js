/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for better performance than jsdom
    environment: 'happy-dom',
    
    // Setup files - equivalent to Jest's setupFilesAfterEnv
    setupFiles: ['./tests/vitest-setup.js'],
    
    // Test file patterns - match Jest's testMatch, plus broader patterns for Phase 1
    include: ['**/tests/**/*.vitest.js', '**/tests/**/*.{test,vitest}.js'],
    
    // Timeout configuration
    testTimeout: 10000,
    
    // Coverage configuration to match Jest exactly
    coverage: {
      provider: 'v8',
      include: [
        'js/**/*.js'
      ],
      exclude: [
        'js/main.js',
        '**/node_modules/**'
      ],
      reporter: ['text', 'html', 'lcov', 'json', 'clover'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 70,
        branches: 54,
        functions: 64,
        lines: 70
      }
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
