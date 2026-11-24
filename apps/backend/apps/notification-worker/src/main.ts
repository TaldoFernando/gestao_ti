import { Logger } from '@nestjs/common';
import { connect, type ConsumeMessage } from 'amqplib';
import { createTransport } from 'nodemailer';
import { DLQ, MAX_ATTEMPTS, QUEUE, RETRY_QUEUE, assertTopology, type TicketEvent } from '@app/common';
import { deliver } from './delivery';
import { SeenIds } from './dedup';
import { sendWhatsApp } from './whatsapp';
import { render } from './templates';

const log = new Logger('Worker');
const seen = new SeenIds();
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
  conn.on('error', () => undefined);
  const ch = await conn.createConfirmChannel();
  await assertTopology(ch);
  await ch.prefetch(5);

  await ch.consume(QUEUE, (msg: ConsumeMessage | null) => {
    void handle(msg).catch(() => { log.error('Falha ao confirmar retry; reiniciando sem ack.'); process.exit(1); });
  });
  async function handle(msg: ConsumeMessage | null) {
    if (!msg) return;
    const attempt = Number(msg.properties.headers?.['x-attempts'] ?? 1);
    // messageId = id da linha do outbox; o mesmo evento republicado chega com o mesmo id.
    const id: string | undefined = msg.properties.messageId;
    if (id && seen.has(id)) {
      log.warn(`mensagem repetida ignorada (${id})`);
      ch.ack(msg);
      return;
    }
    // Marca antes de enviar para que uma cópia que chegue ao mesmo tempo (prefetch 5) também seja ignorada.
    if (id) seen.add(id);
    const completed: string[] = [...(msg.properties.headers?.['x-completed-channels'] ?? [])];
    try {
      const event = JSON.parse(msg.content.toString()) as TicketEvent;
      const { subject, text } = render(event);
      await deliver(completed,
        () => mailer.sendMail({ from: FROM, to: event.email, subject, text }),
        process.env.WHATSAPP_ENABLED === 'true' ? () => sendWhatsApp(event) : undefined,
      );
      log.log(`${event.type} ${event.protocol}: canais enviados`);
    } catch (e) {
      // Não enviou: libera o id para a nova tentativa (retry) passar.
      if (id) seen.delete(id);
      // Retry com espera (fila com TTL); depois de MAX_ATTEMPTS vai para a DLQ para análise manual.
      const target = attempt < MAX_ATTEMPTS ? RETRY_QUEUE : DLQ;
      ch.sendToQueue(target, msg.content, {
        ...msg.properties,
        persistent: true,
        headers: { ...msg.properties.headers, 'x-completed-channels': completed, 'x-attempts': target === DLQ ? attempt : attempt + 1, 'x-last-error': (e as Error).message },
      });
      await ch.waitForConfirms();
      log.warn(`tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${(e as Error).message}) → ${target}`);
    }
    ch.ack(msg);
  }
  log.log(`consumindo ${QUEUE}`);
}

start().catch((e) => {
  log.error(`não conectou ao RabbitMQ: ${e.message}`);
  process.exit(1);
});
