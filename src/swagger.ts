import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildSwaggerDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('TikTok Lead Ads -> Bitrix24 CRM')
    .setDescription(
      'Nhận lead từ TikTok Lead Generation, đồng bộ sang Bitrix24, convert deal theo rule và báo cáo hiệu quả.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .build();
  return SwaggerModule.createDocument(app, config);
}
