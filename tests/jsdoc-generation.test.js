const { execSync } = require('child_process');

describe('JSDoc Generation', () => {
  test('generates documentation without errors', () => {
    // This will throw if JSDoc fails
    execSync('npx jsdoc --configure jsdoc.json', { stdio: 'ignore' });
  });
});
