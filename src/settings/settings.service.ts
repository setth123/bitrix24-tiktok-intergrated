import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../common/cache.service';
import { DealRule, parseCondition } from '../deals/rule-engine';
import { Configuration } from './configuration.entity';
import {
  CampaignSpend,
  CONFIG_KEYS,
  DEFAULT_DEAL_RULES,
  DEFAULT_FIELD_MAPPING,
  DEFAULT_PIPELINE_STAGES,
  FieldMapping,
  PipelineStage,
} from './defaults';

const CACHE_TTL_SEC = 300;

/** Đọc/ghi cấu hình runtime trong bảng `configurations`, cache trên Redis. */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Configuration)
    private readonly repo: Repository<Configuration>,
    private readonly cache: CacheService,
  ) {}

  private get<T>(key: string, fallback: T): Promise<T> {
    return this.cache.getOrSet(`config:${key}`, CACHE_TTL_SEC, async () => {
      const row = await this.repo.findOneBy({ key });
      return (row?.value as T) ?? fallback;
    });
  }

  private async set(key: string, value: object): Promise<void> {
    await this.repo.upsert({ key, value, updatedAt: new Date() }, ['key']);
    await this.cache.del(`config:${key}`);
  }

  getFieldMapping(): Promise<FieldMapping> {
    return this.get(CONFIG_KEYS.fieldMapping, DEFAULT_FIELD_MAPPING);
  }

  async setFieldMapping(mapping: FieldMapping): Promise<FieldMapping> {
    for (const [source, target] of Object.entries(mapping)) {
      if (typeof target !== 'string' || !target.trim()) {
        throw new BadRequestException(
          `Mapping "${source}" phải là tên field Bitrix24`,
        );
      }
    }
    await this.set(CONFIG_KEYS.fieldMapping, mapping);
    return mapping;
  }

  async getRules(): Promise<{
    deal_rules: DealRule[];
    pipeline_stages: PipelineStage[];
  }> {
    const [dealRules, stages] = await Promise.all([
      this.get(CONFIG_KEYS.dealRules, DEFAULT_DEAL_RULES),
      this.get(CONFIG_KEYS.pipelineStages, DEFAULT_PIPELINE_STAGES),
    ]);
    return { deal_rules: dealRules, pipeline_stages: stages };
  }

  async setRules(dealRules: DealRule[], stages?: PipelineStage[]) {
    dealRules.forEach((rule, i) => {
      try {
        parseCondition(rule.condition);
      } catch (err) {
        throw new BadRequestException(
          `deal_rules[${i}]: ${(err as Error).message}`,
        );
      }
    });
    await this.set(CONFIG_KEYS.dealRules, dealRules);
    if (stages) await this.set(CONFIG_KEYS.pipelineStages, stages);
    return this.getRules();
  }

  getCampaignSpend(): Promise<CampaignSpend> {
    return this.get(CONFIG_KEYS.campaignSpend, {});
  }

  async setCampaignSpend(spend: CampaignSpend): Promise<CampaignSpend> {
    for (const [campaignId, amount] of Object.entries(spend)) {
      if (typeof amount !== 'number' || amount < 0) {
        throw new BadRequestException(
          `Chi phí của campaign ${campaignId} không hợp lệ`,
        );
      }
    }
    await this.set(CONFIG_KEYS.campaignSpend, spend);
    return spend;
  }
}
