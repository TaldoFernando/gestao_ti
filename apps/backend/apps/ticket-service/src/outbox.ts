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
 * Entrega pelo menos uma vez: se cair entre o confirm e o update, o evento sai de novo com o mesmo
 * messageId (id da linha), e o notification-worker ignora o repetido (dedup.ts).
 * FOR UPDATE SKIP LOCKED permite publishers concorrentes sem reservarem as mesmas linhas.
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
    const c = await channel();
    const count = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; type: string; payload: TicketEvent }[]>`
        SELECT "id", "type", "payload"
        FROM "Outbox"
        WHERE "publishedAt" IS NULL
        ORDER BY "createdAt" ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `;
      if (!rows.length) return 0;

      for (const row of rows) {
        c.publish(EXCHANGE, row.type, Buffer.from(JSON.stringify(row.payload)), {
          persistent: true,
          messageId: row.id,
          contentType: 'application/json',
        });
      }
      await c.waitForConfirms();
      await tx.outbox.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { publishedAt: new Date() } });
      return rows.length;
    }, { maxWait: 5_000, timeout: 30_000 });

    if (count) log.log(`${count} evento(s) publicados`);
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
