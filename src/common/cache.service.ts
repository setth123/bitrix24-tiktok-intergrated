import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.provider';

const PREFIX = 'tb:cache:';

/** Cache JSON đơn giản trên Redis. Redis lỗi thì bỏ qua cache chứ không làm hỏng request. */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    try {
      const hit = await this.redis.get(PREFIX + key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${String(err)}`);
    }
    const value = await load();
    try {
      await this.redis.set(
        PREFIX + key,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
      );
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${String(err)}`);
    }
    return value;
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(PREFIX + key);
    } catch (err) {
      this.logger.warn(`Cache delete failed for ${key}: ${String(err)}`);
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
