import { Controller, Get, Query } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { ListDealsDto } from './dto/deal.dto';

@ApiTags('deals')
@ApiSecurity('api-key')
@Controller('api/v1/deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  /** Danh sách deal, lọc theo status (open/won/lost) và người phụ trách */
  @Get()
  list(@Query() query: ListDealsDto) {
    return this.deals.list(query);
  }
}
