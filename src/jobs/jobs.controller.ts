import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DeadLetterService } from './dead-letter.service';

@ApiTags('jobs')
@ApiSecurity('api-key')
@Controller('api/v1/jobs')
export class JobsController {
  constructor(private readonly deadLetters: DeadLetterService) {}

  /** Các job đã thất bại hết số lần retry */
  @Get('dead-letters')
  list(@Query('limit') limit?: string) {
    return this.deadLetters.list(Math.min(Number(limit) || 50, 500));
  }

  /** Chạy lại toàn bộ job trong dead letter queue */
  @Post('dead-letters/retry')
  @HttpCode(200)
  retry() {
    return this.deadLetters.retryAll();
  }
}
