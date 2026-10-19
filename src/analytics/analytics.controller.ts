import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { toCsv } from './report-utils';

@ApiTags('analytics')
@ApiSecurity('api-key')
@Controller('api/v1')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Tỷ lệ chuyển đổi lead -> deal -> won */
  @Get('analytics/conversion-rates')
  @ApiQuery({ name: 'date_range', required: false, example: '30d' })
  conversionRates(@Query('date_range') range?: string) {
    return this.analytics.conversionRates(range);
  }

  /** Hiệu quả theo campaign: CPL, ROI, conversion rate, lead score trung bình */
  @Get('analytics/campaign-performance')
  @ApiQuery({ name: 'date_range', required: false, example: '30d' })
  campaignPerformance(@Query('date_range') range?: string) {
    return this.analytics.campaignPerformance(range);
  }

  /** Thống kê real-time cho dashboard */
  @Get('analytics/dashboard')
  @Header('Cache-Control', 'no-store')
  dashboard() {
    return this.analytics.dashboard();
  }

  /** Export lead ra CSV (mở được bằng Excel) hoặc JSON */
  @Get('reports/export')
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'json'] })
  @ApiQuery({ name: 'date_range', required: false, example: '30d' })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format = 'csv',
    @Query('date_range') range?: string,
  ) {
    const rows = await this.analytics.exportLeads(range);
    if (format === 'json') return rows;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tiktok-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return toCsv(rows);
  }
}
