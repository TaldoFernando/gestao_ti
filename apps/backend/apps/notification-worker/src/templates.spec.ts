import { render } from './templates';

const base = { protocol: 'JAC-AAAA-BBBB', title: 'Impressora', email: 'a@b.com', requesterName: 'Maria' };

it('cada evento gera assunto com protocolo e link de acompanhamento', () => {
  for (const e of [
    { ...base, type: 'ticket.created' as const },
    { ...base, type: 'ticket.status_changed' as const, status: 'Resolvido' },
    { ...base, type: 'ticket.replied' as const, message: 'Trocamos o cabo.' },
  ]) {
    const { subject, text } = render(e);
    expect(subject).toContain('JAC-AAAA-BBBB');
    expect(text).toContain('/acompanhar/JAC-AAAA-BBBB');
    expect(text).toContain('Maria');
  }
  expect(render({ ...base, type: 'ticket.replied', message: 'Trocamos o cabo.' }).text).toContain('Trocamos o cabo.');
});
