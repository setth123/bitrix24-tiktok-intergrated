import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Outgoing webhook của Bitrix24 (application/x-www-form-urlencoded), ví dụ:
 * event=ONCRMDEALUPDATE&data[FIELDS][ID]=123&auth[application_token]=xxx
 * STAGE_ID/OPPORTUNITY là tùy chọn (Bitrix24 không gửi; nếu thiếu sẽ gọi crm.deal.get).
 */
export class Bitrix24DealWebhookDto {
  @IsString() event: string;

  @IsObject()
  data: { FIELDS: { ID: string; STAGE_ID?: string; OPPORTUNITY?: string } };

  @IsOptional() @IsObject() auth?: { application_token?: string };
}
