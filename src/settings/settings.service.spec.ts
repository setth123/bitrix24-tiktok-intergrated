import { BadRequestException } from '@nestjs/common';
import { mockRepo } from '../test-utils';
import {
  DEFAULT_DEAL_RULES,
  DEFAULT_FIELD_MAPPING,
  DEFAULT_PIPELINE_STAGES,
} from './defaults';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  const setup = () => {
    const repo = mockRepo();
    // Cache "pass-through" để kiểm tra logic DB.
    const cache = {
      getOrSet: jest.fn((_k: string, _t: number, load: () => unknown) =>
        load(),
      ),
      del: jest.fn(),
    };
    return {
      service: new SettingsService(repo as any, cache as any),
      repo,
      cache,
    };
  };

  it('returns defaults when nothing is stored, stored values otherwise', async () => {
    const { service, repo } = setup();
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.getFieldMapping()).resolves.toEqual(
      DEFAULT_FIELD_MAPPING,
    );
    await expect(service.getRules()).resolves.toEqual({
      deal_rules: DEFAULT_DEAL_RULES,
      pipeline_stages: DEFAULT_PIPELINE_STAGES,
    });
    await expect(service.getCampaignSpend()).resolves.toEqual({});

    repo.findOneBy.mockResolvedValue({ value: { a: 'B' } });
    await expect(service.getFieldMapping()).resolves.toEqual({ a: 'B' });
  });

  it('saves mapping and invalidates cache', async () => {
    const { service, repo, cache } = setup();
    await service.setFieldMapping({ 'lead_data.city': 'UF_CRM_CITY' });
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'field_mapping' }),
      ['key'],
    );
    expect(cache.del).toHaveBeenCalledWith('config:field_mapping');
    await expect(service.setFieldMapping({ x: ' ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('validates rule conditions before saving', async () => {
    const { service, repo } = setup();
    repo.findOneBy.mockResolvedValue(null);
    const rule = {
      condition: 'lead.score > 50',
      action: 'create_deal' as const,
      pipeline_id: '0',
      stage_id: 'NEW',
    };
    await service.setRules([rule], DEFAULT_PIPELINE_STAGES);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
    await expect(
      service.setRules([{ ...rule, condition: 'nonsense' }]),
    ).rejects.toThrow('deal_rules[0]');
  });

  it('validates campaign spend', async () => {
    const { service } = setup();
    await expect(service.setCampaignSpend({ c1: 100 })).resolves.toEqual({
      c1: 100,
    });
    await expect(service.setCampaignSpend({ c1: -1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
