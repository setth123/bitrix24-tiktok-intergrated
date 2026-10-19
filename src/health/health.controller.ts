import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../common/public.decorator';
import { REDIS } from '../common/redis.provider';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: process còn sống */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: kiểm tra PostgreSQL và Redis, trả 503 nếu có thành phần lỗi */
  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.db.query('SELECT 1').then(
        () => 'up',
        () => 'down',
      ),
      this.redis.ping().then(
        () => 'up',
        () => 'down',
      ),
    ]);
    const result = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      details: { database, redis },
      uptime_sec: Math.round(process.uptime()),
    };
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
