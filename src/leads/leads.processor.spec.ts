import { LeadsProcessor } from './leads.processor';

describe('LeadsProcessor', () => {
  const processorService = {
    process: jest.fn().mockResolvedValue({ leadId: 'l1' }),
    markFailed: jest.fn(),
  };
  const deadLetters = {
    isFinalFailure: jest.fn(),
    moveToDeadLetter: jest.fn(),
  };
  const worker = new LeadsProcessor(
    processorService as any,
    deadLetters as any,
    { notify: jest.fn() } as any,
  );
  const job = { data: { eventId: 'evt_1' } } as any;

  it('delegates processing', async () => {
    await expect(worker.process(job)).resolves.toEqual({ leadId: 'l1' });
    expect(processorService.process).toHaveBeenCalledWith('evt_1');
  });

  it('marks event failed and moves to DLQ after the last attempt', async () => {
    deadLetters.isFinalFailure
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await worker.onFailed(job, new Error('retry me'));
    expect(processorService.markFailed).not.toHaveBeenCalled();
    await worker.onFailed(job, new Error('boom'));
    expect(processorService.markFailed).toHaveBeenCalledWith('evt_1', 'boom');
    expect(deadLetters.moveToDeadLetter).toHaveBeenCalledWith(
      'leads',
      job,
      expect.any(Error),
      expect.anything(),
    );
  });
});
