const path = require('path');

module.exports = {
  transform: {
    '^.+\\.(j|t)s?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.json'}],
  },
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/..', '../src', '../tests'],
  collectCoverageFrom: ['../src/**/*.ts', '!../src/app/**', '!../src/**/*.d.ts'],
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage',
  moduleDirectories: ['node_modules', path.join(__dirname, '../src'), path.join(__dirname, '../tests')],
};
