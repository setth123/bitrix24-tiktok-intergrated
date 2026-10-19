import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { NotificationService } from '../common/notification.service';
import { compact } from '../common/object-path';
import { REDIS } from '../common/redis.provider';
import { AppConfig } from '../config/configuration';
import { Bitrix24Service } from '../integrations/bitrix24.service';
import { QUEUES, TiktokSyncJob, toJobId } from '../jobs/queues';
import { Lead } from '../leads/lead.entity';
import { PipelineStage } from '../settings/defaults';
import { SettingsService } from '../settings/settings.service';
import { Deal, DealStatus } from './deal.entity';
import { ListDealsDto } from './dto/deal.dto';
import { DealRule, findMatchingRule } from './rule-engine';

export type DealOptions = Omit<DealRule, 'condition' | 'action'>;

/** Stage của pipeline khác 0 trên Bitrix24 có dạng "C<pipeline>:<stage>". */
export const toBitrixStage = (pipelineId: string, stage: string) =>
  pipelineId && pipelineId !== '0' ? `C${pipelineId}:${stage}` : stage;
export const fromBitrixStage = (stage: string) => stage.replace(/^C\d+:/, '');

export function stageStatus(
  stage: string,
  stages: PipelineStage[],
): DealStatus {
  const semantic = stages.find((s) => s.id === stage)?.semantic;
  if (semantic) return semantic;
  if (stage === 'WON') return 'won';
  if (stage === 'LOSE') return 'lost';
  return 'open';
}

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    @InjectRepository(Deal) private readonly deals: Repository<Deal>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectQueue(QUEUES.tiktokSync)
    private readonly tiktokQueue: Queue<TiktokSyncJob>,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly bitrix: Bitrix24Service,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async list(query: ListDealsDto) {
    const [items, total] = await this.deals.findAndCount({
      where: compact({
        status: query.status as DealStatus | undefined,
        assignedTo: query.assigned_to,
      }),
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  /** Chạy rule engine; rule đầu tiên khớp với action create_deal sẽ tạo Deal. */
  async applyRules(
    lead: Lead,
    context: Record<string, unknown>,
  ): Promise<Deal | null> {
    const { deal_rules } = await this.settings.getRules();
    const rule = findMatchingRule(deal_rules, context);
    if (!rule || rule.action !== 'create_deal') return null;
    this.logger.log(`Lead ${lead.id} khớp rule "${rule.condition}"`);
    return this.createFromLead(lead, rule);
  }

  /** Convert thủ công qua API; tham số thiếu thì lấy theo rule khớp đầu tiên / mặc định. */
  async convertLead(
    leadId: string,
    overrides: Partial<DealOptions>,
  ): Promise<Deal> {
    const lead = await this.leads.findOneBy({ id: leadId });
    if (!lead) throw new NotFoundException('Lead not found');
    const { deal_rules } = await this.settings.getRules();
    const rule = findMatchingRule(deal_rules, { ...lead.rawData, lead });
    return this.createFromLead(lead, {
      pipeline_id: rule?.pipeline_id ?? '0',
      stage_id: rule?.stage_id ?? 'NEW',
      probability: rule?.probability,
      assigned_to: rule?.assigned_to,
      amount: rule?.amount,
      currency: rule?.currency,
      ...compact(overrides),
    });
  }

  /**
   * Tạo Deal (idempotent): mỗi lead chỉ có 1 deal (unique lead_id). Nếu lần trước đã lưu local
   * nhưng gọi Bitrix24 lỗi thì lần retry sẽ chỉ đẩy phần còn thiếu lên Bitrix24.
   */
  async createFromLead(lead: Lead, opts: DealOptions): Promise<Deal> {
    if (!lead.bitrix24Id) {
      throw new ConflictException('Lead chưa được đồng bộ sang Bitrix24');
    }
    let deal = await this.deals.findOneBy({ leadId: lead.id });
    if (deal?.bitrix24Id) return deal;

    if (!deal) {
      const { pipeline_stages } = await this.settings.getRules();
      deal = await this.deals.save(
        this.deals.create({
          leadId: lead.id,
          title: `TikTok: ${lead.name}`,
          amount: opts.amount ?? null,
          currency: opts.currency ?? 'VND',
          pipelineId: opts.pipeline_id,
          stage: opts.stage_id,
          probability:
            opts.probability ??
            pipeline_stages.find((s) => s.id === opts.stage_id)?.probability ??
            0,
          status: 'open',
          assignedTo: await this.pickAssignee(opts.assigned_to),
        }),
      );
    }

    deal.bitrix24Id = await this.bitrix.addDeal({
      TITLE: deal.title,
      CATEGORY_ID: deal.pipelineId,
      STAGE_ID: toBitrixStage(deal.pipelineId, deal.stage),
      PROBABILITY: deal.probability,
      OPPORTUNITY: deal.amount ?? undefined,
      CURRENCY_ID: deal.currency,
      ASSIGNED_BY_ID: deal.assignedTo ?? undefined,
      LEAD_ID: lead.bitrix24Id,
      SOURCE_ID: 'ADVERTISING',
      UTM_SOURCE: 'tiktok',
      UTM_CAMPAIGN: lead.campaignName ?? undefined,
    });
    await this.deals.update(deal.id, { bitrix24Id: deal.bitrix24Id });
    await this.leads.update(lead.id, { status: 'converted' });

    await this.bitrix.addTimelineComment(
      'deal',
      deal.bitrix24Id,
      `Deal tạo tự động từ TikTok lead (campaign: ${lead.campaignName ?? '-'}, score: ${lead.score})`,
    );
    if (deal.assignedTo) {
      await this.bitrix.notifyUser(
        deal.assignedTo,
        `Bạn được giao deal mới: ${deal.title}`,
      );
    }
    await this.notifications.notify('deal.created', `Deal mới: ${deal.title}`, {
      dealId: deal.id,
      bitrix24Id: deal.bitrix24Id,
      assignedTo: deal.assignedTo,
    });
    return deal;
  }

  /** User cố định, hoặc round-robin trong danh sách (bộ đếm trên Redis để chạy đúng khi scale nhiều instance). */
  async pickAssignee(assignedTo?: string | string[]): Promise<string | null> {
    if (Array.isArray(assignedTo) && assignedTo.length > 0) {
      const n = await this.redis.incr(`tb:rr:${assignedTo.join(',')}`);
      return assignedTo[(n - 1) % assignedTo.length];
    }
    if (typeof assignedTo === 'string' && assignedTo) return assignedTo;
    return this.config.get('bitrix24', { infer: true }).defaultAssignee;
  }

  /** Xử lý webhook ONCRMDEALUPDATE từ Bitrix24: cập nhật stage/status, deal won thì sync về TikTok. */
  async applyBitrixUpdate(
    bitrix24Id: number,
    stageId?: string,
    opportunity?: string,
  ): Promise<{ updated: boolean; status?: DealStatus }> {
    const deal = await this.deals.findOneBy({ bitrix24Id });
    if (!deal) return { updated: false };

    if (!stageId) {
      const remote = await this.bitrix.getDeal(bitrix24Id);
      stageId = String(remote.STAGE_ID);
      opportunity = remote.OPPORTUNITY as string | undefined;
    }
    const { pipeline_stages } = await this.settings.getRules();
    const stage = fromBitrixStage(stageId);
    const status = stageStatus(stage, pipeline_stages);
    const becameWon = deal.status !== 'won' && status === 'won';

    await this.deals.update(deal.id, {
      stage,
      status,
      probability:
        pipeline_stages.find((s) => s.id === stage)?.probability ??
        deal.probability,
      amount:
        opportunity !== undefined && opportunity !== ''
          ? Number(opportunity)
          : deal.amount,
      closedAt: status === 'open' ? null : (deal.closedAt ?? new Date()),
    });

    if (becameWon) {
      await this.tiktokQueue.add(
        'conversion',
        { dealId: deal.id },
        { jobId: toJobId(`won_${deal.id}`) },
      );
      await this.notifications.notify('deal.won', `Deal won: ${deal.title}`, {
        dealId: deal.id,
      });
    }
    return { updated: true, status };
  }
}
