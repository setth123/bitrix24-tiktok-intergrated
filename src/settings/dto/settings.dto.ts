import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { DealRule } from '../../deals/rule-engine';

export class FieldMappingDto {
  /** Ví dụ { "lead_data.email": "EMAIL[0][VALUE]" } */
  @IsObject() field_mapping: Record<string, string>;
}

export class DealRuleDto implements DealRule {
  /** Ví dụ: "campaign.campaign_name CONTAINS 'sale' AND lead.score >= 50" */
  @IsString() @IsNotEmpty() condition: string;
  @IsIn(['create_deal']) action: 'create_deal';
  @IsString() pipeline_id: string;
  @IsString() stage_id: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  /** User ID hoặc mảng user ID (round-robin) */
  @IsOptional() assigned_to?: string | string[];
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() currency?: string;
}

export class PipelineStageDto {
  @IsString() id: string;
  @IsInt() @Min(0) @Max(100) probability: number;
  @IsOptional() @IsIn(['won', 'lost']) semantic?: 'won' | 'lost';
}

export class RulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DealRuleDto)
  deal_rules: DealRuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineStageDto)
  pipeline_stages?: PipelineStageDto[];
}

export class CampaignSpendDto {
  /** campaign_id -> tổng chi phí (VND) */
  @IsObject() campaign_spend: Record<string, number>;
}
