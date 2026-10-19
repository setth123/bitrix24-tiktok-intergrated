import { mockQueue, mockRepo } from '../test-utils';
import { LeadsService } from './leads.service';

const dto = {
  event: 'lead.generate',
  event_id: 'evt:1',
  timestamp: 1,
  lead_data: { email: 'a@b.com' },
};

function setup(insertedRows: unknown[]) {
  const leads = mockRepo();
  const events = mockRepo();
  const queue = mockQueue();
  const qb = {
    insert: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    execute: jest.fn(),
  };
  qb.insert.mockReturnValue(qb);
  qb.values.mockReturnValue(qb);
  qb.orIgnore.mockReturnValue(qb);
  qb.execute.mockResolvedValue({ raw: insertedRows });
  events.createQueryBuilder.mockReturnValue(qb);
  return {
    service: new LeadsService(leads as any, events as any, queue as any),
    leads,
    events,
    queue,
    qb,
  };
}

describe('LeadsService', () => {
  it('stores raw event and enqueues lead events with a safe job id', async () => {
    const { service, queue, qb } = setup([{ id: 'x' }]);
    await expect(service.ingest(dto, { raw: true })).resolves.toBe('queued');
    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt:1',
        payload: { raw: true },
        status: 'received',
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { eventId: 'evt:1' },
      { jobId: 'evt_1' },
    );
  });

  it('only records non-lead events', async () => {
    const { service, queue, qb } = setup([{ id: 'x' }]);
    await expect(
      service.ingest({ ...dto, event: 'user.interaction' }, {}),
    ).resolves.toBe('recorded');
    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'recorded' }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('ignores duplicates but re-enqueues events that never reached the queue', async () => {
    const { service, events, queue } = setup([]);
    events.findOneBy.mockResolvedValueOnce({ status: 'processed' });
    await expect(service.ingest(dto, {})).resolves.toBe('duplicate');
    expect(queue.add).not.toHaveBeenCalled();

    events.findOneBy.mockResolvedValueOnce({ status: 'received' });
    await expect(service.ingest(dto, {})).resolves.toBe('queued');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('imports historical events and summarizes results', async () => {
    const { service, qb, events } = setup([{ id: 'x' }]);
    qb.execute
      .mockResolvedValueOnce({ raw: [{}] })
      .mockResolvedValueOnce({ raw: [] })
      .mockResolvedValueOnce({ raw: [{}] });
    events.findOneBy.mockResolvedValue({ status: 'processed' });
    const result = await service.importHistorical([
      dto,
      dto,
      { ...dto, event: 'user.interaction' },
    ]);
    expect(result).toEqual({ queued: 1, duplicate: 1, recorded: 1 });
  });

  it('lists leads with pagination and only defined filters', async () => {
    const { service, leads } = setup([]);
    leads.findAndCount.mockResolvedValue([[{ id: '1' }], 21]);
    const result = await service.list({ page: 3, limit: 10, source: 'tiktok' });
    expect(result).toEqual({
      items: [{ id: '1' }],
      total: 21,
      page: 3,
      limit: 10,
    });
    expect(leads.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'tiktok' },
        skip: 20,
        take: 10,
      }),
    );
  });
});
