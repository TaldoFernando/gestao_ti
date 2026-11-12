import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HealthController } from '@app/common';

@Module({ controllers: [HealthController] })
export class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
if (require.main === module) bootstrap();
