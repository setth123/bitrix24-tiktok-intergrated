import type { Config } from 'jest';

const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
};

const config: Config = {
  projects: [
    // Unit test: không cần Postgres/Redis.
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      setupFiles: ['<rootDir>/test/setup-unit.ts'],
    },
    // E2E/integration test: chạy trên Postgres + Redis thật, Bitrix24/TikTok ở chế độ mock.
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/swagger.ts',
    '!src/**/*.module.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.dto.ts',
    '!src/database/**',
    '!src/test-utils.ts',
  ],
  coverageThreshold: {
    global: { statements: 80, lines: 80, functions: 80, branches: 70 },
  },
  coverageDirectory: './coverage',
  coverageReporters: ['text-summary', 'text', 'lcov', 'json-summary'],
};

export default config;
