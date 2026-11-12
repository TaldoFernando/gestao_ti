import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

@Module({})
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(WorkerModule, {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
      queue: 'notifications',
      queueOptions: { durable: true },
    },
  });
  await app.listen();
  Logger.log('notification-worker conectado ao RabbitMQ', 'Worker');
}
bootstrap();
