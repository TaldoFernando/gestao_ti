// Executado no gateway; o worker fica parado durante o teste para conferir o reenvio.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connect } = require('amqplib');
const base = 'http://localhost:3000/api';
(async () => {
  const csrf = { 'X-Requested-With': 'gestao-ti', 'content-type': 'application/json' };
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: csrf, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const body = await login.json(); assert.equal(body.token, undefined);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { ...csrf, Cookie: cookie };
  assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await fetch(`${base}/auth/session`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  assert.equal((await fetch(`${base}/notifications/dlq`)).status, 401);
  const conn = await connect(process.env.RABBITMQ_URL);
  const ch = await conn.createConfirmChannel();
  const protocol = `SMOKE-${randomUUID()}`;
  try {
    for (let i = 0; i < 2; i++) ch.sendToQueue('notifications.dlq', Buffer.from(JSON.stringify({ type: 'ticket.created', protocol, requesterName: 'Teste', title: 'Teste', email: 'smoke@example.com' })), { messageId: `${protocol}-${i}`, persistent: true, headers: { 'x-last-error': 'Falha de teste', 'x-attempts': 3, 'x-completed-channels': ['email'] } });
    await ch.waitForConfirms();
    const list = async () => { const res = await fetch(`${base}/notifications/dlq`, { headers }); assert.equal(res.status, 200); return (await res.json()).items.filter((m) => m.protocol === protocol); };
    const first = await list(); assert.equal(first.length, 2); assert.equal(first[0].error, 'Falha de teste');
    assert.equal((await list()).length, 2, 'listar não consome');
    const before = (await ch.checkQueue('notifications')).messageCount;
    assert.equal((await fetch(`${base}/notifications/dlq/${first[0].id}`, { method: 'POST', headers })).status, 204);
    assert.equal((await ch.checkQueue('notifications')).messageCount, before + 1);
    // Verifica a mensagem reprocessada sem consumir entradas de outros testes.
    for (let i = 0; i < before + 1; i++) {
      const replay = await ch.get('notifications', { noAck: false });
      if (!replay) break;
      if (JSON.parse(replay.content.toString()).protocol === protocol) {
        assert.equal(replay.properties.headers['x-attempts'], 1);
        assert.deepEqual(replay.properties.headers['x-completed-channels'], ['email']);
        assert.notEqual(replay.properties.messageId, `${protocol}-0`);
        ch.ack(replay); break;
      }
    }
    const remaining = await list(); assert.equal(remaining.length, 1);
    assert.equal((await fetch(`${base}/notifications/dlq/${remaining[0].id}`, { method: 'DELETE', headers })).status, 204);
    assert.equal((await list()).length, 0);
    assert.equal((await fetch(`${base}/notifications/dlq/${remaining[0].id}`, { method: 'POST', headers })).status, 404);
    const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers }); assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /ti-session=;/);
    console.log('ok   sessão, CSRF e DLQ: listagem sem consumo, reenvio confirmado e descarte');
  } finally { await ch.close(); await conn.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
