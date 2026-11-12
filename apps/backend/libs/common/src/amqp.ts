import type { Channel } from 'amqplib';

// Topologia de mensageria, declarada igual por quem publica e por quem consome (operações idempotentes).
//
//   tickets (topic) ──ticket.*──► notifications ──falhou──► notifications.retry (TTL 10s) ──► notifications
//                                              └─ esgotou tentativas ──► notifications.dlq
export const EXCHANGE = 'tickets';
export const QUEUE = 'notifications';
export const RETRY_QUEUE = 'notifications.retry';
export const DLQ = 'notifications.dlq';
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 10_000;

export async function assertTopology(ch: Channel) {
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EXCHANGE, 'ticket.*');
  await ch.assertQueue(RETRY_QUEUE, {
    durable: true,
    // Ao expirar, volta direto para a fila principal (exchange padrão, chave = nome da fila).
    arguments: { 'x-message-ttl': RETRY_DELAY_MS, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': QUEUE },
  });
  await ch.assertQueue(DLQ, { durable: true });
}

export type TicketEvent =
  | { type: 'ticket.created'; protocol: string; title: string; email: string; requesterName: string }
  | { type: 'ticket.status_changed'; protocol: string; title: string; email: string; requesterName: string; status: string }
  | { type: 'ticket.replied'; protocol: string; title: string; email: string; requesterName: string; message: string };
