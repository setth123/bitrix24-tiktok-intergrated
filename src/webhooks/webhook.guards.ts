import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { safeEqual } from '../common/api-key.guard';
import { AppConfig } from '../config/configuration';
import { verifyTiktokSignature } from './tiktok-signature';

/** Xác thực header TikTok-Signature (HMAC-SHA256 trên raw body). */
@Injectable()
export class TiktokSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const { webhookSecret, signatureToleranceSec } = this.config.get('tiktok', {
      infer: true,
    });
    const valid =
      !!req.rawBody &&
      verifyTiktokSignature(
        req.rawBody,
        req.header('tiktok-signature'),
        webhookSecret,
        signatureToleranceSec,
      );
    if (!valid) throw new UnauthorizedException('Invalid TikTok-Signature');
    return true;
  }
}

/** Bitrix24 outgoing webhook gửi kèm auth[application_token]. */
@Injectable()
export class Bitrix24TokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get('bitrix24', { infer: true }).appToken;
    const token = (req.body as { auth?: { application_token?: unknown } })?.auth
      ?.application_token;
    if (!expected || typeof token !== 'string' || !safeEqual(token, expected)) {
      throw new UnauthorizedException('Invalid Bitrix24 application token');
    }
    return true;
  }
}
