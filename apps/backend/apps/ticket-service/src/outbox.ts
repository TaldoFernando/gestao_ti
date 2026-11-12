import { Logger } from '@nestjs/common';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { EXCHANGE, assertTopology, type TicketEvent } from '@app/common';
import type { Prisma, PrismaClient } from '.prisma/ticket';

type Tx = Prisma.TransactionClient;

/** Grava o evento na transação do chamado. Nunca publica direto: quem publica é o loop abaixo. */
export function enqueue(tx: Tx, event: TicketEvent) {
  return tx.outbox.create({ data: { type: event.type, payload: event } });
}

const log = new Logger('Outbox');

/**
 * Lê o outbox a cada 2s, publica com confirmação do broker e só então marca como publicado.
 * Entrega pelo menos uma vez: se cair entre o confirm e o update, o e-mail pode sair repetido.
 * ponytail: um publisher por instância; com réplicas, trocar o findMany por SELECT ... FOR UPDATE SKIP LOCKED.
 */
export function startOutboxPublisher(db: PrismaClient, url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672') {
  let conn: ChannelModel | null = null;
  let ch: ConfirmChannel | null = null;
  const reset = () => {
    conn?.close().catch(() => undefined);
    conn = ch = null;
  };

  async function channel() {
    if (ch) return ch;
    conn = await connect(url);
    conn.on('error', () => undefined); // o 'close' abaixo trata a reconexão
    conn.on('close', () => {
      conn = ch = null;
    });
    ch = await conn.createConfirmChannel();
    await assertTopology(ch);
    log.log('conectado ao RabbitMQ');
    return ch;
  }

  async function tick() {
    const rows = await db.outbox.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 50 });
    if (!rows.length) return;
    const c = await channel();
    for (const r of rows) {
      c.publish(EXCHANGE, r.type, Buffer.from(JSON.stringify(r.payload)), { persistent: true, messageId: r.id, contentType: 'application/json' });
    }
    await c.waitForConfirms();
    await db.outbox.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { publishedAt: new Date() } });
    log.log(`${rows.length} evento(s) publicados`);
  }

  let stopped = false;
  (async function loop() {
    while (!stopped) {
      try {
        await tick();
      } catch (e) {
        // Broker fora: os eventos ficam no outbox e saem quando ele voltar.
        log.warn(`publicação adiada: ${(e as Error).message}`);
        reset();
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  return () => {
    stopped = true;
    reset();
  };
}
