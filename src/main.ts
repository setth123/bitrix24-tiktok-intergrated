import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from './app.module';
import { buildSwaggerDocument } from './swagger';

async function bootstrap() {
  // rawBody cần cho việc kiểm tra chữ ký webhook TikTok.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();

  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);

  // npm run swagger:export -> ghi file OpenAPI rồi thoát.
  if (process.env.SWAGGER_EXPORT_PATH) {
    writeFileSync(
      process.env.SWAGGER_EXPORT_PATH,
      JSON.stringify(document, null, 2),
    );
    await app.close();
    return;
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(
    `API: http://localhost:${port} - Swagger: http://localhost:${port}/docs`,
    'Bootstrap',
  );
}

void bootstrap();
