/* Helper dùng chung cho unit test (bị loại khỏi build). */
import { ConfigService } from '@nestjs/config';
import { AppConfig, configuration } from './config/configuration';

export type Mocked<T> = { [K in keyof T]: jest.Mock };

/** Repository giả với các method TypeORM hay dùng. */
export function mockRepo() {
  return {
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((x: unknown) => ({ ...(x as object) })),
    save: jest.fn((x: { id?: string }) =>
      Promise.resolve({ id: x.id ?? 'generated-id', ...x }),
    ),
    update: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  };
}

export function mockQueue() {
  return {
    add: jest.fn().mockResolvedValue({}),
    getJobs: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    getJobCounts: jest
      .fn()
      .mockResolvedValue({ waiting: 1, active: 0, delayed: 0, failed: 2 }),
  };
}

/** ConfigService thật dựa trên configuration() + override. */
export function testConfig(
  overrides: Record<string, unknown> = {},
): ConfigService<AppConfig, true> {
  return new ConfigService<AppConfig, true>({
    ...configuration(),
    ...overrides,
  });
}
