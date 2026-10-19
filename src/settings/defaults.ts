import type { DealRule } from '../deals/rule-engine';

export const CONFIG_KEYS = {
  fieldMapping: 'field_mapping',
  dealRules: 'deal_rules',
  pipelineStages: 'pipeline_stages',
  campaignSpend: 'campaign_spend',
} as const;

export interface PipelineStage {
  id: string;
  probability: number;
  /** Stage kết thúc: 'won' hoặc 'lost'. */
  semantic?: 'won' | 'lost';
}

/** Đường dẫn trong payload TikTok (đã chuẩn hóa) -> field Bitrix24. */
export type FieldMapping = Record<string, string>;

/** campaign_id -> tổng chi phí quảng cáo (VND). */
export type CampaignSpend = Record<string, number>;

export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  'lead_data.full_name': 'NAME',
  'lead_data.email': 'EMAIL[0][VALUE]',
  'lead_data.phone': 'PHONE[0][VALUE]',
  'lead_data.city': 'UF_CRM_CITY',
  'campaign.campaign_name': 'UF_CRM_UTM_CAMPAIGN',
  'campaign.ad_name': 'UF_CRM_AD_NAME',
  'lead_data.ttclid': 'UF_CRM_TTCLID',
};

export const DEFAULT_DEAL_RULES: DealRule[] = [
  {
    condition: "campaign.campaign_name CONTAINS 'sale'",
    action: 'create_deal',
    pipeline_id: '1',
    stage_id: 'NEW',
    probability: 30,
  },
];

// Stage mặc định của pipeline Bitrix24.
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'NEW', probability: 10 },
  { id: 'PREPARATION', probability: 30 },
  { id: 'PREPAYMENT_INVOICE', probability: 50 },
  { id: 'EXECUTING', probability: 70 },
  { id: 'FINAL_INVOICE', probability: 90 },
  { id: 'WON', probability: 100, semantic: 'won' },
  { id: 'LOSE', probability: 0, semantic: 'lost' },
];
