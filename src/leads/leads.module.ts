import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DealsModule } from '../deals/deals.module';
import { JobsModule } from '../jobs/jobs.module';
import { SettingsModule } from '../settings/settings.module';
import { LeadProcessorService } from './lead-processor.service';
import { Lead } from './lead.entity';
import { LeadsController } from './leads.controller';
import { LeadsProcessor } from './leads.processor';
import { LeadsService } from './leads.service';
import { WebhookEvent } from './webhook-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, WebhookEvent]),
    JobsModule,
    SettingsModule,
    DealsModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadProcessorService, LeadsProcessor],
  exports: [LeadsService],
})
export class LeadsModule {}
