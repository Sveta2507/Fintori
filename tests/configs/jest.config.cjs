// Jest-конфиг: запускает только fintori.test.js (написан под Jest).
// unit.test.js и integration.test.js — под Vitest, Jest их не трогает.
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/fintori.test.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './tests/configs/babel.config.cjs' }],
  },
};