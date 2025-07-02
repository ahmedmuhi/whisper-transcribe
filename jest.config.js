export default {
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/main.js',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'html', 'lcov', 'json', 'clover'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    }
  },
  verbose: true,
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 10000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/js/$1'
  }
};
