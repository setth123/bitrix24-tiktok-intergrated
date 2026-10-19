import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { Bitrix24Service } from './bitrix24.service';
import {
  Bitrix24HttpTransport,
  Bitrix24MockTransport,
} from './bitrix24.transport';
import { BITRIX24_TRANSPORT } from './integrations.constants';
import { TiktokService } from './tiktok.service';

@Global()
@Module({
  providers: [
    {
      provide: BITRIX24_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const { mode, webhookUrl } = config.get('bitrix24', { infer: true });
        return mode === 'live'
          ? new Bitrix24HttpTransport(webhookUrl)
          : new Bitrix24MockTransport();
      },
    },
    Bitrix24Service,
    TiktokService,
  ],
  exports: [BITRIX24_TRANSPORT, Bitrix24Service, TiktokService],
})
export class IntegrationsModule {}
