import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

export const REDIS = Symbol('REDIS');

export const redisProvider: Provider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>) =>
    new Redis({
      ...config.get('redis', { infer: true }),
      // Cache không được làm treo request: lỗi nhanh rồi fallback về DB.
      maxRetriesPerRequest: 1,
    }),
};
