import { connect, type GetMessage } from 'amqplib';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { DLQ, QUEUE, assertTopology } from '@app/common';

const idOf = (m: GetMessage) => createHash('sha256').update(m.content).update(JSON.stringify(m.properties)).digest('hex');

// Examina no máximo 100 mensagens por operação. Mantém as mensagens sem ack até encerrar
// a leitura para não ler a mesma repetidamente; fechar o canal devolve as não confirmadas.
export async function deadLetters(req: Request, res: Response) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).end();
  const id = req.path.split('/')[4];
  if (req.method !== 'GET' && !/^[a-f0-9]{64}$/.test(id ?? '')) return res.status(400).json({ message: 'Identificador inválido.' });
  let conn;
  try {
    conn = await connect(process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672', { timeout: 5000 });
    conn.on('error', () => undefined);
    const ch = await conn.createConfirmChannel();
    await assertTopology(ch);
    const info = await ch.checkQueue(DLQ);
    const items = [];
    for (let i = 0; i < Math.min(info.messageCount, 100); i++) {
      const msg = await ch.get(DLQ, { noAck: false });
      if (!msg) break;
      const key = idOf(msg);
      if (req.method === 'GET') {
        let event;
        try { event = JSON.parse(msg.content.toString()); } catch { event = {}; }
        items.push({ id: key, protocol: event.protocol ?? '', type: event.type ?? 'inválido', error: String(msg.properties.headers?.['x-last-error'] ?? 'Sem motivo informado'), attempts: msg.properties.headers?.['x-attempts'] ?? 0 });
      } else if (key === id) {
        if (req.method === 'POST') {
          ch.sendToQueue(QUEUE, msg.content, { ...msg.properties, persistent: true, messageId: randomUUID(), headers: { ...msg.properties.headers, 'x-attempts': 1, 'x-last-error': '' } });
          await ch.waitForConfirms();
        }
        ch.ack(msg);
        await ch.close();
        return res.status(204).end();
      }
    }
    await ch.close();
    return req.method === 'GET' ? res.json({ items, total: info.messageCount, limit: 100 }) : res.status(404).json({ message: 'Mensagem não encontrada nas primeiras 100 entradas. Atualize a lista.' });
  } catch {
    return res.status(503).json({ message: 'Fila temporariamente indisponível.' });
  } finally {
    await conn?.close().catch(() => undefined);
  }
}
