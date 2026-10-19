import {
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { of, throwError, lastValueFrom } from 'rxjs';
import { testConfig } from '../test-utils';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiKeyGuard, safeEqual } from './api-key.guard';
import { CacheService } from './cache.service';
import { LoggingInterceptor } from './logging.interceptor';
import { NotificationService } from './notification.service';

const httpContext = (req: object, res: object = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as any;

describe('CacheService', () => {
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  const cache = new CacheService(redis as any);
  beforeEach(() => jest.clearAllMocks());

  it('returns cached values or loads and stores them', async () => {
    redis.get.mockResolvedValueOnce('{"a":1}');
    await expect(
      cache.getOrSet('k', 10, () => Promise.resolve({ a: 2 })),
    ).resolves.toEqual({ a: 1 });

    redis.get.mockResolvedValueOnce(null);
    await expect(
      cache.getOrSet('k', 10, () => Promise.resolve({ a: 2 })),
    ).resolves.toEqual({ a: 2 });
    expect(redis.set).toHaveBeenCalledWith('tb:cache:k', '{"a":2}', 'EX', 10);
  });

  it('falls back to the loader when Redis fails', async () => {
    redis.get.mockRejectedValueOnce(new Error('down'));
    redis.set.mockRejectedValueOnce(new Error('down'));
    redis.del.mockRejectedValueOnce(new Error('down'));
    await expect(
      cache.getOrSet('k', 10, () => Promise.resolve(3)),
    ).resolves.toBe(3);
    await expect(cache.del('k')).resolves.toBeUndefined();
    await cache.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalled();
  });
});

describe('NotificationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs only when no webhook is configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await new NotificationService(testConfig({ notifyWebhookUrl: '' })).notify(
      't',
      'm',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the webhook and never throws', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockRejectedValueOnce(new Error('down'));
    const service = new NotificationService(
      testConfig({ notifyWebhookUrl: 'https://hook' }),
    );
    await service.notify('deal.won', 'Deal won', { id: 1 });
    await service.notify('x', 'y');
    await expect(service.notify('x', 'y')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('https://hook');
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      type: 'deal.won',
      text: 'Deal won',
      data: { id: 1 },
    });
  });
});

describe('ApiKeyGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };

  it('compares strings in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });

  it('allows public routes and valid keys, rejects others', () => {
    const guard = new ApiKeyGuard(
      reflector as any,
      testConfig({ apiKey: 'secret' }),
    );
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    expect(guard.canActivate(httpContext({ headers: {} }))).toBe(true);
    expect(
      guard.canActivate(httpContext({ headers: { 'x-api-key': 'secret' } })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(httpContext({ headers: { 'x-api-key': 'nope' } })),
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(httpContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });

  it('is open when no API key is configured', () => {
    const guard = new ApiKeyGuard(reflector as any, testConfig({ apiKey: '' }));
    expect(guard.canActivate(httpContext({ headers: {} }))).toBe(true);
  });
});

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  const run = (exception: unknown) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/x' }),
        getResponse: () => res,
      }),
    };
    filter.catch(exception, host as any);
    return {
      status: res.status.mock.calls[0][0],
      body: res.json.mock.calls[0][0],
    };
  };

  it('formats HTTP exceptions', () => {
    expect(run(new NotFoundException('missing'))).toMatchObject({
      status: 404,
      body: { statusCode: 404, message: 'missing', path: '/x' },
    });
    expect(run(new HttpException('plain', 418))).toMatchObject({
      status: 418,
      body: { message: 'plain' },
    });
  });

  it('hides internal errors', () => {
    expect(run(new Error('db password leaked'))).toMatchObject({
      status: 500,
      body: { message: 'Internal server error' },
    });
    expect(run('weird')).toMatchObject({ status: 500 });
  });
});

describe('LoggingInterceptor', () => {
  const interceptor = new LoggingInterceptor();
  const ctx = httpContext(
    { method: 'GET', originalUrl: '/x' },
    { statusCode: 200 },
  );

  it('passes values and errors through', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') })),
    ).resolves.toBe('ok');
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new NotFoundException()),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('x')),
        }),
      ),
    ).rejects.toThrow('x');
  });
});
