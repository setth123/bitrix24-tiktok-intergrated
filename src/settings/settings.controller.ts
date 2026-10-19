import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  CampaignSpendDto,
  FieldMappingDto,
  RulesDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('config')
@ApiSecurity('api-key')
@Controller('api/v1/config')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Mapping field TikTok -> Bitrix24 */
  @Get('mappings')
  async getMappings() {
    return { field_mapping: await this.settings.getFieldMapping() };
  }

  @Put('mappings')
  async putMappings(@Body() dto: FieldMappingDto) {
    return {
      field_mapping: await this.settings.setFieldMapping(dto.field_mapping),
    };
  }

  /** Rule convert Lead -> Deal và cấu hình pipeline stages */
  @Get('rules')
  getRules() {
    return this.settings.getRules();
  }

  @Put('rules')
  putRules(@Body() dto: RulesDto) {
    return this.settings.setRules(dto.deal_rules, dto.pipeline_stages);
  }

  /** Chi phí quảng cáo theo campaign (dùng tính CPL/ROI) */
  @Get('campaign-spend')
  async getSpend() {
    return { campaign_spend: await this.settings.getCampaignSpend() };
  }

  @Put('campaign-spend')
  async putSpend(@Body() dto: CampaignSpendDto) {
    return {
      campaign_spend: await this.settings.setCampaignSpend(dto.campaign_spend),
    };
  }
}
