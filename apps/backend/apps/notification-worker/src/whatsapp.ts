import type { TicketEvent } from '@app/common';

export function phoneNumber(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^[1-9]\d{10,14}$/.test(digits)) throw new Error('WhatsApp: número inválido.');
  return digits;
}

// Template utility com quatro parâmetros de corpo: nome, protocolo, atualização e link.
// Templates permitem notificar mesmo fora da janela de atendimento de 24h.
export async function sendWhatsApp(event: TicketEvent, request = fetch) {
  const { WHATSAPP_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneId, WHATSAPP_TEMPLATE: template, WHATSAPP_API_VERSION: version } = process.env;
  if (!token || !phoneId || !template || !version) throw new Error('WhatsApp: configuração incompleta.');
  if (!event.whatsapp) throw new Error('WhatsApp: evento sem número; evento anterior à integração.');
  const update = event.type === 'ticket.created' ? 'Chamado recebido' : event.type === 'ticket.replied' ? 'Nova resposta da equipe de TI' : event.status;
  const res = await request(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: phoneNumber(event.whatsapp), type: 'template',
      template: { name: template, language: { code: process.env.WHATSAPP_LANGUAGE ?? 'pt_BR' }, components: [{ type: 'body', parameters: [event.requesterName, event.protocol, update, `${process.env.PUBLIC_URL ?? 'http://localhost:8080'}/acompanhar/${event.protocol}`].map((text) => ({ type: 'text', text })) }] },
    }),
  });
  // Não copiar corpo de erro do provedor: pode conter dados pessoais ou credenciais.
  if (!res.ok) throw new Error(`WhatsApp: provedor respondeu HTTP ${res.status}.`);
  const result = await res.json() as { messages?: { id: string }[] };
  if (!result.messages?.[0]?.id) throw new Error('WhatsApp: provedor não confirmou aceitação.');
}
