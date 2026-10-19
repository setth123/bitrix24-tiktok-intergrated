import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const db = { query: jest.fn() };
  const redis = { ping: jest.fn() };
  const controller = new HealthController(db as any, redis as any);

  it('reports liveness', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports ok when dependencies are up', async () => {
    db.query.mockResolvedValue([{}]);
    redis.ping.mockResolvedValue('PONG');
    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      details: { database: 'up', redis: 'up' },
    });
  });

  it('returns 503 when a dependency is down', async () => {
    db.query.mockRejectedValue(new Error('down'));
    redis.ping.mockResolvedValue('PONG');
    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
