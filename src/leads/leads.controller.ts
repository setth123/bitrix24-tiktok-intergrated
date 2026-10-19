import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DealsService } from '../deals/deals.service';
import { ConvertLeadDto } from '../deals/dto/deal.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { ImportLeadsDto } from './dto/tiktok-webhook.dto';
import { LeadsService } from './leads.service';

@ApiTags('leads')
@ApiSecurity('api-key')
@Controller('api/v1/leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly deals: DealsService,
  ) {}

  /** Danh sách lead (phân trang, lọc theo source/status/campaign) */
  @Get()
  list(@Query() query: ListLeadsDto) {
    return this.leads.list(query);
  }

  /** Convert lead thành deal thủ công */
  @Post(':id/convert-to-deal')
  convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertLeadDto) {
    return this.deals.convertLead(id, dto);
  }

  /** Batch import lead lịch sử (migration), xử lý qua cùng queue với webhook */
  @Post('import')
  @HttpCode(202)
  import(@Body() dto: ImportLeadsDto) {
    return this.leads.importHistorical(dto.events);
  }
}
