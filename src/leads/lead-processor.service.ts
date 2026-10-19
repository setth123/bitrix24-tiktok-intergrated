import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { UnrecoverableError } from 'bullmq';
import { Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { DealsService } from '../deals/deals.service';
import { Bitrix24Service } from '../integrations/bitrix24.service';
import { SettingsService } from '../settings/settings.service';
import { buildBitrixLeadFields, buildLeadContext } from './bitrix-lead-fields';
import { TiktokWebhookDto } from './dto/tiktok-webhook.dto';
import { Lead } from './lead.entity';
import { NormalizedLead, normalizeLead, scoreLead } from './lead-normalizer';
import { WebhookEvent } from './webhook-event.entity';

/**
 * Xử lý 1 webhook event: chuẩn hóa -> dedupe/merge -> đồng bộ Bitrix24 -> rule engine.
 * Mọi bước đều idempotent để BullMQ có thể retry an toàn.
 */
@Injectable()
export class LeadProcessorService {
  private readonly logger = new Logger(LeadProcessorService.name);

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(WebhookEvent)
    private readonly events: Repository<WebhookEvent>,
    private readonly bitrix: Bitrix24Service,
    private readonly settings: SettingsService,
    private readonly deals: DealsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async process(
    eventId: string,
  ): Promise<{ leadId?: string; skipped?: boolean }> {
    const event = await this.events.findOneBy({ eventId });
    if (!event) throw new UnrecoverableError(`Event ${eventId} not found`);
    if (event.status === 'processed') return { skipped: true };

    const payload = event.payload as TiktokWebhookDto & Record<string, any>;
    const normalized = normalizeLead(
      payload,
      this.config.get('defaultCountry', { infer: true }),
    );
    if (!normalized.email && !normalized.phone) {
      // Dữ liệu sai thì retry cũng vô ích -> đi thẳng vào DLQ.
      throw new UnrecoverableError(
        'Lead không có email hoặc số điện thoại hợp lệ',
      );
    }

    const existing = await this.findDuplicate(normalized);
    const draft = existing
      ? this.merge(existing, normalized, payload)
      : this.leads.create({
          ...this.contactFields(normalized),
          externalId: eventId,
          source: 'tiktok',
          email: normalized.email,
          phone: normalized.phone,
          submissions: 1,
          rawData: payload,
          status: 'new',
        });
    draft.score = Math.max(
      draft.score ?? 0,
      scoreLead(normalized, draft.submissions),
    );
    // Unique index email/phone chặn trùng khi 2 job chạy song song: job thua sẽ lỗi, retry và merge.
    const lead = await this.leads.save(draft);

    const context = buildLeadContext(payload, normalized, {
      score: lead.score,
      submissions: lead.submissions,
    });
    await this.syncToBitrix(lead, normalized, context, eventId);
    await this.deals.applyRules(lead, context);

    await this.events.update(event.id, {
      status: 'processed',
      leadId: lead.id,
      processedAt: new Date(),
      error: null,
    });
    return { leadId: lead.id };
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    await this.events.update({ eventId }, { status: 'failed', error });
  }

  private async findDuplicate(n: NormalizedLead): Promise<Lead | null> {
    if (n.email) {
      const byEmail = await this.leads.findOneBy({ email: n.email });
      if (byEmail) return byEmail;
    }
    return n.phone ? this.leads.findOneBy({ phone: n.phone }) : null;
  }

  private contactFields(n: NormalizedLead): Partial<Lead> {
    return {
      name: n.name,
      city: n.city,
      campaignId: n.campaignId,
      campaignName: n.campaignName,
      adId: n.adId,
      adName: n.adName,
      formId: n.formId,
      ttclid: n.ttclid,
    };
  }

  /**
   * Merge strategy: giá trị mới (khác rỗng) ghi đè thông tin hồ sơ/nguồn; email/phone
   * chỉ bổ sung khi đang trống (là khóa dedupe nên không ghi đè).
   */
  private merge(
    lead: Lead,
    n: NormalizedLead,
    payload: Record<string, any>,
  ): Lead {
    const isRetry = lead.rawData?.event_id === payload.event_id;
    if (!isRetry) lead.submissions += 1;
    for (const [key, value] of Object.entries(this.contactFields(n))) {
      if (key === 'name' && !payload.lead_data?.full_name) continue;
      if (value) (lead as any)[key] = value;
    }
    lead.email ??= n.email;
    lead.phone ??= n.phone;
    lead.rawData = payload;
    return lead;
  }

  private async syncToBitrix(
    lead: Lead,
    n: NormalizedLead,
    context: Record<string, any>,
    eventId: string,
  ): Promise<void> {
    const fields = buildBitrixLeadFields(
      context,
      n,
      await this.settings.getFieldMapping(),
    );
    const isNew = !lead.bitrix24Id;
    if (lead.bitrix24Id) {
      // Bitrix24 sẽ THÊM email/phone mới thay vì thay thế -> không gửi lại khi update.
      const updateFields = { ...fields };
      delete updateFields.EMAIL;
      delete updateFields.PHONE;
      await this.bitrix.updateLead(lead.bitrix24Id, updateFields);
    } else {
      lead.bitrix24Id = await this.bitrix.addLead(fields);
    }
    if (lead.status === 'new') lead.status = 'synced';
    await this.leads.update(lead.id, {
      bitrix24Id: lead.bitrix24Id,
      status: lead.status,
    });

    await this.bitrix.addTimelineComment(
      'lead',
      lead.bitrix24Id,
      [
        isNew
          ? 'Lead mới từ TikTok Lead Ads'
          : `Lead gửi form lần ${lead.submissions} (TikTok)`,
        `Campaign: ${n.campaignName ?? '-'} (${n.campaignId ?? '-'})`,
        `Ad: ${n.adName ?? '-'} (${n.adId ?? '-'})`,
        `Form: ${n.formName ?? '-'} (${n.formId ?? '-'})`,
        `Lead score: ${lead.score}`,
        `TikTok event: ${eventId}`,
      ].join('\n'),
    );
    this.logger.log(
      `Lead ${lead.id} -> Bitrix24 #${lead.bitrix24Id} (${isNew ? 'created' : 'updated'})`,
    );
  }
}
