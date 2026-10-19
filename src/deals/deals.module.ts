import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module';
import { Lead } from '../leads/lead.entity';
import { SettingsModule } from '../settings/settings.module';
import { Deal } from './deal.entity';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { TiktokSyncProcessor } from './tiktok-sync.processor';

@Module({
  imports: [TypeOrmModule.forFeature([Deal, Lead]), JobsModule, SettingsModule],
  controllers: [DealsController],
  providers: [DealsService, TiktokSyncProcessor],
  exports: [DealsService],
})
export class DealsModule {}
