import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { NotificationService } from './notification.service';
import { REDIS, redisProvider } from './redis.provider';

@Global()
@Module({
  providers: [redisProvider, CacheService, NotificationService],
  exports: [REDIS, CacheService, NotificationService],
})
export class CommonModule {}
