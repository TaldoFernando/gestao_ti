# Plano e resultados de testes

Cada decisão de arquitetura tem um teste que falha se ela quebrar. Todos rodam contra o sistema de pé (`docker compose up -d`), e os de integração rodam também no CI (job `integration`).

| Tipo | Onde | O que valida | ADR |
|---|---|---|---|
| Unitário | `apps/backend/**/*.spec.ts` (Jest) | regras de acesso por perfil, rate limit, formato e unicidade do protocolo, templates de e-mail | 0003, 0006 |
| Integração | `scripts/smoke-assets.sh` | (cria e apaga os próprios dados) CRUD do inventário via gateway, regras no banco (RESTRICT / SET NULL), validação, login, JWT, cabeçalho forjado, perfil responsável, bloqueio de login | 0002, 0003 |
| Integração | `scripts/smoke-tickets.sh` | abertura pública com anexo, tipo de arquivo proibido, consulta pública sem dados pessoais, fila do técnico, assumir/status/resposta, nota interna invisível, anexo só com login | 0006 |
| Integração | `scripts/smoke-scope.sh` | (cria e apaga os próprios dados) escopo do responsável (lista, detalhe, histórico, filtro por setor alheio), registro de movimentações | 0007 |
| Resiliência | `scripts/smoke-notify.sh` | RabbitMQ parado, SMTP parado (retry → DLQ), inventário parado | 0001, 0004 |
| Carga | `load/k6.js` (k6 em container) | capacidade com 70 usuários virtuais e comportamento do rate limit | 0003 |

## Resultados (12/11/2026, máquina de desenvolvimento, Docker Desktop no Windows)

### Integração e resiliência: todos passando

```
smoke-assets   14/14 ok      smoke-tickets  13/13 ok
smoke-scope     9/9  ok      smoke-notify    9/9  ok      jest 8/8 ok
```

Resiliência em detalhe:

| Cenário | Resultado esperado | Obtido |
|---|---|---|
| RabbitMQ parado | chamado abre (201), nenhum e-mail sai; quando o broker volta, o e-mail sai | ✔ outbox reenviou sozinho |
| SMTP parado | 3 tentativas com 10 s de espera, depois `notifications.dlq` | ✔ mensagem na DLQ com `x-last-error` |
| asset-service parado | chamado abre sem o nome do setor e com o patrimônio só como texto (sem vínculo); gateway responde 503 no inventário e não cai | ✔ e volta sozinho com `restart: unless-stopped` |

### Carga (k6, 60 s, 3 cenários em paralelo)

Cenários: abertura de chamado (até 20 por segundo), 30 usuários consultando protocolo e 20 técnicos listando o inventário.

**1ª rodada: falhou e revelou um gargalo real.**

| Métrica | Valor |
|---|---|
| Requisições | 79.368 (1.320 req/s) |
| Falhas | **61%**: 502 no nginx |
| Causa | `connect() failed (99: Address not available)`: o nginx abria um socket novo para o gateway a cada requisição e esgotou as portas efêmeras do container |

**Correção:** `upstream` com `keepalive 64`, `proxy_http_version 1.1` e `Connection ""` em `apps/web/nginx.conf`.

**2ª rodada, depois da correção (rate limit desligado com `RATE_LIMIT_OFF=1` para medir capacidade):**

| Cenário | p95 | Limite | |
|---|---|---|---|
| Abrir chamado (multipart + transação + outbox) | 57,8 ms | < 800 ms | ✔ |
| Consultar protocolo | 42,2 ms | < 300 ms | ✔ |
| Listar inventário (com JWT) | 46,2 ms | < 300 ms | ✔ |
| **Total** | **92.031 requisições, 1.530 req/s, 0,00% de falhas** | < 1% | ✔ |

**Com o rate limit ligado (configuração de produção):** das 365.257 requisições do mesmo teste, 364.923 receberam 429 com p95 de 12 ms. O limitador descarta o excesso barato, antes de chegar aos serviços e ao banco. É o comportamento desejado contra abuso do formulário público, já que todo o teste sai de um único IP.

## Como reproduzir

```bash
cp .env.example .env
docker compose up -d --build --wait
./scripts/smoke-assets.sh && ./scripts/smoke-tickets.sh && ./scripts/smoke-scope.sh
./scripts/smoke-notify.sh          # para e religa containers
(cd apps/backend && npm test)

# carga (limitador desligado só durante o teste)
RATE_LIMIT_OFF=1 docker compose up -d gateway
set -a; . ./.env; set +a
docker run --rm -i --network gestao_ti_default -e ADMIN_EMAIL -e ADMIN_PASSWORD grafana/k6:0.54.0 run - < load/k6.js
docker compose up -d gateway       # religa o limitador
```

O limite de login (5/min por IP) vale para os scripts também. Entre rodadas seguidas, espere 1 minuto ou rode `docker compose restart gateway`.

## Não coberto

- Testes de interface automatizados no navegador. As telas foram verificadas manualmente com o Playwright durante o desenvolvimento, sem uma suíte.
- Carga com múltiplas réplicas dos serviços: o rate limit e o publisher do outbox assumem uma instância (ADRs 0003 e 0004).
