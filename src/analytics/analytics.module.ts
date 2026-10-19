import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { SettingsModule } from '../settings/settings.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportsScheduler } from './reports.scheduler';

@Module({
  imports: [JobsModule, SettingsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ReportsScheduler],
})
export class AnalyticsModule {}
