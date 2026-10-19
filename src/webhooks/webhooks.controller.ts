import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/public.decorator';
import { DealsService } from '../deals/deals.service';
import { TiktokWebhookDto } from '../leads/dto/tiktok-webhook.dto';
import { LeadsService } from '../leads/leads.service';
import { Bitrix24DealWebhookDto } from './dto/bitrix24-webhook.dto';
import { Bitrix24TokenGuard, TiktokSignatureGuard } from './webhook.guards';

@ApiTags('webhooks')
@Public()
@Throttle({ default: { limit: 1000, ttl: 60_000 } })
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly leads: LeadsService,
    private readonly deals: DealsService,
  ) {}

  /** Nhận webhook TikTok Lead Generation. Trả 202 ngay, xử lý qua queue. */
  @Post('tiktok/leads')
  @HttpCode(202)
  @UseGuards(TiktokSignatureGuard)
  @ApiHeader({
    name: 'TikTok-Signature',
    description: 't=<unix>,s=<hmac_sha256_hex>',
  })
  async tiktokLeads(
    @Body() dto: TiktokWebhookDto,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Lưu payload gốc (trước khi ValidationPipe lọc field) để audit.
    const raw = JSON.parse(req.rawBody!.toString('utf8')) as Record<
      string,
      unknown
    >;
    const status = await this.leads.ingest(dto, raw);
    return { status, event_id: dto.event_id };
  }

  /** Nhận outgoing webhook ONCRMDEALUPDATE từ Bitrix24 để đồng bộ stage của deal. */
  @Post('bitrix24/deals')
  @HttpCode(200)
  @UseGuards(Bitrix24TokenGuard)
  bitrixDeals(@Body() dto: Bitrix24DealWebhookDto) {
    const fields = dto.data?.FIELDS;
    const id = Number(fields?.ID);
    if (!Number.isInteger(id)) return { updated: false };
    return this.deals.applyBitrixUpdate(
      id,
      fields.STAGE_ID,
      fields.OPPORTUNITY,
    );
  }
}
