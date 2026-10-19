import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TiktokCampaignDto {
  @IsOptional() @IsString() @MaxLength(255) campaign_id?: string;
  @IsOptional() @IsString() @MaxLength(255) campaign_name?: string;
  @IsOptional() @IsString() @MaxLength(255) ad_id?: string;
  @IsOptional() @IsString() @MaxLength(255) ad_name?: string;
}

export class TiktokFormDto {
  @IsOptional() @IsString() @MaxLength(255) form_id?: string;
  @IsOptional() @IsString() @MaxLength(255) form_name?: string;
}

export class TiktokLeadDataDto {
  @IsOptional() @IsString() @MaxLength(255) full_name?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) city?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  interests?: string[];
  @IsOptional() @IsString() @MaxLength(255) utm_source?: string;
  @IsOptional() @IsString() @MaxLength(255) utm_campaign?: string;
  @IsOptional() @IsString() @MaxLength(255) ttclid?: string;
}

export class TiktokCustomQuestionDto {
  @IsString() @MaxLength(255) question: string;
  @IsString() @MaxLength(2000) answer: string;
}

/** Payload webhook TikTok Lead Generation (theo mẫu trong đề bài). */
export class TiktokWebhookDto {
  /** lead.generate | form.complete | user.interaction */
  @IsString() @IsNotEmpty() @MaxLength(100) event: string;
  @IsString() @IsNotEmpty() @MaxLength(255) event_id: string;
  /** Unix timestamp (giây) */
  @IsInt() timestamp: number;
  @IsOptional() @IsString() advertiser_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TiktokCampaignDto)
  campaign?: TiktokCampaignDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TiktokFormDto)
  form?: TiktokFormDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TiktokLeadDataDto)
  lead_data?: TiktokLeadDataDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TiktokCustomQuestionDto)
  custom_questions?: TiktokCustomQuestionDto[];
}

export class ImportLeadsDto {
  /** Danh sách payload lịch sử (cùng format webhook) để migrate. */
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TiktokWebhookDto)
  events: TiktokWebhookDto[];
}
