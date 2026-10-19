import { mockQueue } from '../test-utils';
import { DeadLetterService } from './dead-letter.service';
import { JobsController } from './jobs.controller';

describe('DeadLetterService', () => {
  const setup = () => {
    const dlq = mockQueue();
    const leads = mockQueue();
    const tiktok = mockQueue();
    return {
      service: new DeadLetterService(dlq as any, leads as any, tiktok as any),
      dlq,
      leads,
      tiktok,
    };
  };

  it('detects the final failure', () => {
    const { service } = setup();
    const unrecoverable = Object.assign(new Error('x'), {
      name: 'UnrecoverableError',
    });
    expect(
      service.isFinalFailure(
        { attemptsMade: 1, opts: { attempts: 5 } } as any,
        new Error('x'),
      ),
    ).toBe(false);
    expect(
      service.isFinalFailure(
        { attemptsMade: 5, opts: { attempts: 5 } } as any,
        new Error('x'),
      ),
    ).toBe(true);
    expect(
      service.isFinalFailure(
        { attemptsMade: 1, opts: { attempts: 5 } } as any,
        unrecoverable,
      ),
    ).toBe(true);
    expect(
      service.isFinalFailure(
        { attemptsMade: 1, opts: {} } as any,
        new Error('x'),
      ),
    ).toBe(true);
  });

  it('moves failed jobs to the DLQ and notifies', async () => {
    const { service, dlq } = setup();
    const notifications = { notify: jest.fn() };
    await service.moveToDeadLetter(
      'leads',
      {
        id: '1',
        name: 'process',
        data: { eventId: 'e' },
        attemptsMade: 5,
      } as any,
      new Error('boom'),
      notifications as any,
    );
    expect(dlq.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        queue: 'leads',
        data: { eventId: 'e' },
        error: 'boom',
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'job.dead_letter',
      expect.stringContaining('boom'),
      expect.any(Object),
    );
  });

  it('lists, counts and retries dead letters into the original queue', async () => {
    const { service, dlq, leads, tiktok } = setup();
    const remove = jest.fn();
    const jobs = [
      {
        id: '1',
        data: { queue: 'leads', name: 'process', data: { eventId: 'e' } },
        remove,
      },
      {
        id: '2',
        data: {
          queue: 'tiktok-sync',
          name: 'conversion',
          data: { dealId: 'd' },
        },
        remove,
      },
    ];
    dlq.getJobs.mockResolvedValue(jobs);
    dlq.count.mockResolvedValue(2);
    await expect(service.list(10)).resolves.toEqual([
      { id: '1', ...jobs[0].data },
      { id: '2', ...jobs[1].data },
    ]);
    await expect(service.count()).resolves.toBe(2);
    await expect(service.retryAll()).resolves.toEqual({ retried: 2 });
    expect(leads.add).toHaveBeenCalledWith('process', { eventId: 'e' });
    expect(tiktok.add).toHaveBeenCalledWith('conversion', { dealId: 'd' });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

describe('JobsController', () => {
  it('delegates to DeadLetterService with a bounded limit', async () => {
    const deadLetters = {
      list: jest.fn().mockResolvedValue([]),
      retryAll: jest.fn().mockResolvedValue({ retried: 0 }),
    };
    const controller = new JobsController(deadLetters as any);
    await controller.list('9999');
    expect(deadLetters.list).toHaveBeenCalledWith(500);
    await controller.list();
    expect(deadLetters.list).toHaveBeenLastCalledWith(50);
    await expect(controller.retry()).resolves.toEqual({ retried: 0 });
  });
});
