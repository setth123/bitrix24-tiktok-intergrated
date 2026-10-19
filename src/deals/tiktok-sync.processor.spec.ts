import { mockRepo } from '../test-utils';
import { TiktokSyncProcessor } from './tiktok-sync.processor';

describe('TiktokSyncProcessor', () => {
  const setup = () => {
    const deals = mockRepo();
    const tiktok = { sendConversion: jest.fn().mockResolvedValue(undefined) };
    const deadLetters = {
      isFinalFailure: jest.fn(),
      moveToDeadLetter: jest.fn(),
    };
    const notifications = { notify: jest.fn() };
    const processor = new TiktokSyncProcessor(
      deals as any,
      tiktok as any,
      deadLetters as any,
      notifications as any,
    );
    return { processor, deals, tiktok, deadLetters, notifications };
  };
  const job = { data: { dealId: 'd1' } } as any;

  it('sends a CompletePayment event and marks the deal synced', async () => {
    const { processor, deals, tiktok } = setup();
    deals.findOne.mockResolvedValue({
      id: 'd1',
      amount: 5,
      currency: 'VND',
      tiktokSyncedAt: null,
      lead: { email: 'a@b.com', phone: '+84901234567', ttclid: 'TT' },
    });
    await processor.process(job);
    expect(tiktok.sendConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'CompletePayment',
        eventId: 'deal_d1_won',
        email: 'a@b.com',
        value: 5,
      }),
    );
    expect(deals.update).toHaveBeenCalledWith('d1', {
      tiktokSyncedAt: expect.any(Date),
    });
  });

  it('skips missing or already synced deals', async () => {
    const { processor, deals, tiktok } = setup();
    deals.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lead: {}, tiktokSyncedAt: new Date() });
    await processor.process(job);
    await processor.process(job);
    expect(tiktok.sendConversion).not.toHaveBeenCalled();
  });

  it('moves the job to DLQ only on final failure', async () => {
    const { processor, deadLetters } = setup();
    const err = new Error('x');
    deadLetters.isFinalFailure
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await processor.onFailed(job, err);
    expect(deadLetters.moveToDeadLetter).not.toHaveBeenCalled();
    await processor.onFailed(job, err);
    expect(deadLetters.moveToDeadLetter).toHaveBeenCalledWith(
      'tiktok-sync',
      job,
      err,
      expect.anything(),
    );
  });
});
