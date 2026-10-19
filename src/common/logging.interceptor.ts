import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Log mỗi request: method, url, status, thời gian xử lý. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
          );
        },
        error: (err: { status?: number }) =>
          this.logger.warn(
            `${req.method} ${req.originalUrl} ${err.status ?? 500} ${Date.now() - started}ms`,
          ),
      }),
    );
  }
}
