import { Logger } from '@nestjs/common';
import { connect, type ConsumeMessage } from 'amqplib';
import { createTransport } from 'nodemailer';
import { DLQ, MAX_ATTEMPTS, QUEUE, RETRY_QUEUE, assertTopology, type TicketEvent } from '@app/common';
import { render } from './templates';

const log = new Logger('Worker');
const mailer = createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  connectionTimeout: 5000,
});
const FROM = process.env.MAIL_FROM ?? 'TI Prefeitura <ti@prefeitura.example>';

async function start() {
  const conn = await connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
  conn.on('close', () => {
    // Deixa o Docker reiniciar o container; mensagens não confirmadas voltam para a fila.
    log.error('conexão com o RabbitMQ perdida');
    process.exit(1);
  });
  const ch = await conn.createChannel();
  await assertTopology(ch);
  await ch.prefetch(5);

  await ch.consume(QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;
    const attempt = Number(msg.properties.headers?.['x-attempts'] ?? 1);
    try {
      const event = JSON.parse(msg.content.toString()) as TicketEvent;
      const { subject, text } = render(event);
      await mailer.sendMail({ from: FROM, to: event.email, subject, text });
      log.log(`${event.type} ${event.protocol} → ${event.email}`);
    } catch (e) {
      // Retry com espera (fila com TTL); depois de MAX_ATTEMPTS vai para a DLQ para análise manual.
      const target = attempt < MAX_ATTEMPTS ? RETRY_QUEUE : DLQ;
      ch.sendToQueue(target, msg.content, {
        ...msg.properties,
        persistent: true,
        headers: { ...msg.properties.headers, 'x-attempts': attempt + 1, 'x-last-error': (e as Error).message },
      });
      log.warn(`tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${(e as Error).message}) → ${target}`);
    }
    ch.ack(msg);
  });
  log.log(`consumindo ${QUEUE}`);
}

start().catch((e) => {
  log.error(`não conectou ao RabbitMQ: ${e.message}`);
  process.exit(1);
});
