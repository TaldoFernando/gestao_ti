// Teste de carga. Rodar com o limitador desligado para medir capacidade:
//   RATE_LIMIT_OFF=1 docker compose up -d gateway
//   docker run --rm -i --network gestao_ti_default -e ADMIN_EMAIL -e ADMIN_PASSWORD grafana/k6:0.54.0 run - < load/k6.js
// Cenários em paralelo: cidadãos abrindo chamados, cidadãos consultando protocolo e técnicos lendo o inventário.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE_URL || 'http://web/api';

export const options = {
  scenarios: {
    abrir_chamado: { executor: 'ramping-arrival-rate', exec: 'openTicket', startRate: 2, timeUnit: '1s', preAllocatedVUs: 20, stages: [{ target: 20, duration: '30s' }, { target: 20, duration: '30s' }] },
    consultar_protocolo: { executor: 'constant-vus', exec: 'track', vus: 30, duration: '60s' },
    inventario: { executor: 'constant-vus', exec: 'inventory', vus: 20, duration: '60s' },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{scenario:abrir_chamado}': ['p(95)<800'],
    'http_req_duration{scenario:consultar_protocolo}': ['p(95)<300'],
    'http_req_duration{scenario:inventario}': ['p(95)<300'],
  },
};

export function setup() {
  const headers = { 'content-type': 'application/json', 'X-Requested-With': 'gestao-ti' };
  const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email: __ENV.ADMIN_EMAIL, password: __ENV.ADMIN_PASSWORD }), { headers });
  const created = http.post(`${BASE}/tickets`, JSON.stringify({ requesterName: 'Carga', email: 'carga@exemplo.com', whatsapp: '83999990000', title: 'Teste de carga', description: 'k6' }), { headers });
  const cookie = login.cookies['ti-session']?.[0]?.value;
  const protocol = created.json('protocol');
  if (login.status !== 200 || !cookie) throw new Error(`Login de carga falhou: HTTP ${login.status}`);
  if (created.status !== 201 || !protocol) throw new Error(`Chamado de preparação não retornou protocolo: HTTP ${created.status}`);
  return { cookie, protocol };
}

export function openTicket() {
  const res = http.post(`${BASE}/tickets`, JSON.stringify({ requesterName: 'Carga', email: 'carga@exemplo.com', whatsapp: '83999990000', title: 'Teste de carga', description: 'k6' }), { headers: { 'content-type': 'application/json', 'X-Requested-With': 'gestao-ti' } });
  check(res, { '201': (r) => r.status === 201 });
}

export function track(data) {
  check(http.get(`${BASE}/tickets/protocol/${data.protocol}`), { '200': (r) => r.status === 200 });
}

export function inventory(data) {
  check(http.get(`${BASE}/equipment`, { headers: { Cookie: `ti-session=${data.cookie}` } }), { '200': (r) => r.status === 200 });
}
