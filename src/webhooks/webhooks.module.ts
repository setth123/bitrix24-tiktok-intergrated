import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module';
import { LeadsModule } from '../leads/leads.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [LeadsModule, DealsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
