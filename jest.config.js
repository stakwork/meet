/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        jsx: 'react',
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
};

module.exports = config;
