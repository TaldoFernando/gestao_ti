import { phoneNumber, sendWhatsApp } from './whatsapp';
import { deliver } from './delivery';
const event = { type: 'ticket.created' as const, protocol: 'JAC-TEST-TEST', title: 'Teste', email: 'x@y.com', requesterName: 'Pessoa', whatsapp: '(83) 99999-0000' };
afterEach(() => { for (const key of ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE', 'WHATSAPP_API_VERSION']) delete process.env[key]; });
it('normaliza DDD brasileiro e mantém número internacional', () => {
  expect(phoneNumber('(83) 99999-0000')).toBe('5583999990000');
  expect(phoneNumber('+55 83 99999-0000')).toBe('5583999990000');
  expect(() => phoneNumber('123')).toThrow('inválido');
});
it('envia template oficial e não expõe resposta do provedor em erros', async () => {
  Object.assign(process.env, { WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_TEMPLATE: 'atualizacao_chamado', WHATSAPP_API_VERSION: 'v23.0' });
  const mock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'accepted' }] })));
  await sendWhatsApp(event, mock);
  const [url, init] = mock.mock.calls[0];
  expect(url).toBe('https://graph.facebook.com/v23.0/123/messages');
  expect(JSON.parse(init.body)).toMatchObject({ to: '5583999990000', type: 'template' });
  mock.mockResolvedValue(new Response('secret-provider-content', { status: 429 }));
  await expect(sendWhatsApp(event, mock)).rejects.toThrow('HTTP 429');
});
it('falha de configuração é recuperável pela fila e não descarta a notificação', async () => {
  await expect(sendWhatsApp(event)).rejects.toThrow('configuração incompleta');
});
it('retry do WhatsApp não repete e-mail já enviado', async () => {
  const done: string[] = [];
  const email = jest.fn().mockResolvedValue(undefined);
  const whatsapp = jest.fn().mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce(undefined);
  await expect(deliver(done, email, whatsapp)).rejects.toThrow('HTTP 500');
  await deliver(done, email, whatsapp);
  expect(email).toHaveBeenCalledTimes(1); expect(whatsapp).toHaveBeenCalledTimes(2);
  expect(done).toEqual(['email', 'whatsapp']);
});
it('WhatsApp é enviado mesmo quando SMTP falha', async () => {
  const done: string[] = []; const whatsapp = jest.fn().mockResolvedValue(undefined);
  await expect(deliver(done, jest.fn().mockRejectedValue(new Error('SMTP')), whatsapp)).rejects.toThrow('SMTP');
  expect(done).toEqual(['whatsapp']);
});
