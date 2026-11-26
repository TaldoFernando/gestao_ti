const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = `multi-replica-${Date.now()}`;
const emails = Array.from({ length: 40 }, (_, index) => `${run}-${index}@example.invalid`);
const services = [process.env.TICKET_A, process.env.TICKET_B];
const gateways = [process.env.GATEWAY_A, process.env.GATEWAY_B];

async function main() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`http://${gateways[attempt % gateways.length]}:3000/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'gestao-ti',
        'x-forwarded-for': '198.51.100.77',
      },
      body: JSON.stringify({ email: 'replica-test@invalid.example', password: 'invalid' }),
    });
    const expected = attempt < 5 ? 401 : 429;
    if (response.status !== expected) {
      throw new Error(`Gateway ${attempt + 1}: esperado HTTP ${expected}, recebido HTTP ${response.status}`);
    }
  }
  console.log('ok   gateway replicas compartilham o limite no Redis');

  await Promise.all(emails.map(async (email, index) => {
    const response = await fetch(`http://${services[index % services.length]}:3000/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requesterName: 'Teste de réplicas',
        email,
        whatsapp: '83999990000',
        title: run,
        description: 'Validação de publishers concorrentes do outbox.',
      }),
    });
    if (response.status !== 201) throw new Error(`Abertura ${index + 1} falhou: HTTP ${response.status}`);
  }));

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const latest = await Promise.all(emails.map(async (email) => {
      const url = new URL('http://mailpit:8025/api/v1/search');
      url.searchParams.set('query', `to:${email}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Mailpit retornou HTTP ${response.status}`);
      return (await response.json()).messages_count;
    }));
    if (latest.some((count) => count > 1)) throw new Error('Uma notificação foi enviada mais de uma vez.');
    if (latest.every((count) => count === 1)) {
      console.log(`ok   40 chamados criados nas duas réplicas receberam exatamente 1 e-mail cada (${run})`);
      return;
    }
    await delay(1000);
  }
  throw new Error('Notificações não chegaram em 90s.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
