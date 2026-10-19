import { DealsController } from '../deals/deals.controller';
import { LeadsController } from './leads.controller';

describe('LeadsController / DealsController', () => {
  const leads = {
    list: jest.fn().mockResolvedValue({ items: [] }),
    importHistorical: jest.fn().mockResolvedValue({ queued: 1 }),
  };
  const deals = {
    convertLead: jest.fn().mockResolvedValue({ id: 'd1' }),
    list: jest.fn().mockResolvedValue({ items: [] }),
  };

  it('delegates lead endpoints', async () => {
    const controller = new LeadsController(leads as any, deals as any);
    const query = { page: 1, limit: 10 };
    await controller.list(query);
    expect(leads.list).toHaveBeenCalledWith(query);
    await expect(
      controller.convert('id', { stage_id: 'NEW' }),
    ).resolves.toEqual({ id: 'd1' });
    expect(deals.convertLead).toHaveBeenCalledWith('id', { stage_id: 'NEW' });
    await expect(controller.import({ events: [] })).resolves.toEqual({
      queued: 1,
    });
  });

  it('delegates deal listing', async () => {
    const controller = new DealsController(deals as any);
    await controller.list({ page: 1, limit: 10, status: 'open' });
    expect(deals.list).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      status: 'open',
    });
  });
});
