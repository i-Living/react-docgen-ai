module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'dist/**/*.js',
    '!src/**/*.d.ts',
    '!src/global.d.ts',
    '!bin/**/*.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'ESNext',
        moduleResolution: 'bundler'
      }
    }],
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [],
  extensionsToTreatAsEsm: ['.ts'],
  testTimeout: 30000,
  verbose: true
};