import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  const settings = {
    getFieldMapping: jest.fn().mockResolvedValue({ a: 'B' }),
    setFieldMapping: jest.fn((m: unknown) => Promise.resolve(m)),
    getRules: jest.fn().mockResolvedValue({ deal_rules: [] }),
    setRules: jest.fn().mockResolvedValue({ deal_rules: [1] }),
    getCampaignSpend: jest.fn().mockResolvedValue({ c: 1 }),
    setCampaignSpend: jest.fn((s: unknown) => Promise.resolve(s)),
  };
  const controller = new SettingsController(settings as any);

  it('wraps settings responses', async () => {
    await expect(controller.getMappings()).resolves.toEqual({
      field_mapping: { a: 'B' },
    });
    await expect(
      controller.putMappings({ field_mapping: { x: 'Y' } }),
    ).resolves.toEqual({ field_mapping: { x: 'Y' } });
    await expect(controller.getRules()).resolves.toEqual({ deal_rules: [] });
    await expect(controller.putRules({ deal_rules: [] })).resolves.toEqual({
      deal_rules: [1],
    });
    await expect(controller.getSpend()).resolves.toEqual({
      campaign_spend: { c: 1 },
    });
    await expect(
      controller.putSpend({ campaign_spend: { c: 2 } }),
    ).resolves.toEqual({ campaign_spend: { c: 2 } });
  });
});
