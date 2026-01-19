module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json'],
  transform: {}, // No transform needed for CommonJS
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/unit/**/*.test.js', '**/tests/integration/**/*.test.js'],
  verbose: true,
  // Mock electron-store
  moduleNameMapper: {
    'electron-store': '<rootDir>/tests/mocks/electron-store.js'
  }
};
