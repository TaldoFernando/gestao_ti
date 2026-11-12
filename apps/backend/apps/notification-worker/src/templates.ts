import type { TicketEvent } from '@app/common';

const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://localhost:8080';

export function render(e: TicketEvent): { subject: string; text: string } {
  const link = `${PUBLIC_URL}/acompanhar/${e.protocol}`;
  const hello = `Olá, ${e.requesterName}.`;
  const footer = `\n\nAcompanhe em: ${link}\n\nSetor de TI · Prefeitura Municipal de Jacaraú`;
  switch (e.type) {
    case 'ticket.created':
      return {
        subject: `Chamado ${e.protocol} recebido`,
        text: `${hello}\n\nRecebemos o seu chamado “${e.title}”.\nProtocolo: ${e.protocol}${footer}`,
      };
    case 'ticket.status_changed':
      return {
        subject: `Chamado ${e.protocol}: ${e.status}`,
        text: `${hello}\n\nO chamado “${e.title}” agora está: ${e.status}.${footer}`,
      };
    case 'ticket.replied':
      return {
        subject: `Resposta no chamado ${e.protocol}`,
        text: `${hello}\n\nA equipe de TI respondeu o chamado “${e.title}”:\n\n${e.message}${footer}`,
      };
  }
}
