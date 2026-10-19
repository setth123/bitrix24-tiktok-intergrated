import { getPath, setPath } from '../common/object-path';
import type { FieldMapping } from '../settings/defaults';
import type { BitrixFields } from '../integrations/bitrix24.service';
import type { NormalizedLead } from './lead-normalizer';

/**
 * Context dùng cho field mapping và deal rules: payload TikTok gốc nhưng lead_data
 * được thay bằng giá trị đã chuẩn hóa, cộng thêm `answers` và `lead` (score, submissions).
 */
export function buildLeadContext(
  payload: Record<string, any>,
  lead: NormalizedLead,
  extra: { score: number; submissions: number },
): Record<string, any> {
  return {
    ...payload,
    lead_data: {
      ...payload.lead_data,
      full_name: lead.name,
      email: lead.email,
      phone: lead.phone,
      city: lead.city,
      ttclid: lead.ttclid,
    },
    answers: lead.answers,
    lead: extra,
  };
}

/** Dựng `fields` cho crm.lead.add/update từ mapping cấu hình + các field chuẩn của Bitrix24. */
export function buildBitrixLeadFields(
  context: Record<string, any>,
  lead: NormalizedLead,
  mapping: FieldMapping,
): BitrixFields {
  const fields: BitrixFields = {
    TITLE: `TikTok: ${lead.formName ?? 'Lead form'} - ${lead.name}`,
    SOURCE_ID: 'ADVERTISING',
    SOURCE_DESCRIPTION: [
      'TikTok Lead Ads',
      lead.campaignName &&
        `campaign: ${lead.campaignName} (${lead.campaignId})`,
      lead.adName && `ad: ${lead.adName} (${lead.adId})`,
      lead.formId && `form: ${lead.formId}`,
    ]
      .filter(Boolean)
      .join(' | '),
    UTM_SOURCE: context.lead_data?.utm_source ?? 'tiktok',
    UTM_CAMPAIGN: context.lead_data?.utm_campaign,
    COMMENTS: Object.entries(lead.answers)
      .map(([q, a]) => `${q}: ${a}`)
      .join('\n'),
  };

  for (const [source, target] of Object.entries(mapping)) {
    const value = getPath(context, source);
    if (value === undefined || value === null || value === '') continue;
    setPath(fields, target, Array.isArray(value) ? value.join(', ') : value);
  }

  // Multi-field EMAIL/PHONE của Bitrix24 cần VALUE_TYPE.
  for (const key of ['EMAIL', 'PHONE']) {
    const items = fields[key];
    if (Array.isArray(items)) {
      for (const item of items as Record<string, unknown>[])
        item.VALUE_TYPE ??= 'WORK';
    }
  }
  return fields;
}
