module.exports = {
  transform: {
    '^.+\\.(j|t)s?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.json'}],
  },
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  // testMatch: ['src/**/*.spec.ts'],
  testPathIgnorePatterns: ['tests'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage',
  moduleDirectories: ['node_modules']
};
