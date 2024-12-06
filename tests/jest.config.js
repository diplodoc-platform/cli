const path = require('path');

module.exports = {
  transform: {
    '^.+\\.ts?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.json'}],
  },
  verbose: true,
  preset: 'ts-jest',
  testMatch: ['<rootDir>/**/*.@(test|spec).ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/..', '../src', '../tests'],
  collectCoverageFrom: ['../src/**/*.ts', '!../src/**/*.d.ts'],
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage',
  moduleDirectories: ['node_modules', path.join(__dirname, '../src'), path.join(__dirname, '../tests')],
  snapshotSerializers: ['jest-serializer-html']
};
