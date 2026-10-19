import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { IS_PUBLIC } from './public.decorator';

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Bảo vệ API quản trị bằng header `x-api-key`. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly apiKey: string;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<AppConfig, true>,
  ) {
    this.apiKey = config.get('apiKey', { infer: true });
    if (!this.apiKey) {
      this.logger.warn('API_KEY chưa được cấu hình - API quản trị đang mở!');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || !this.apiKey) return true;

    const provided = context.switchToHttp().getRequest<Request>().headers[
      'x-api-key'
    ];
    if (typeof provided === 'string' && safeEqual(provided, this.apiKey)) {
      return true;
    }
    throw new UnauthorizedException('Invalid or missing x-api-key');
  }
}
