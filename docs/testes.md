# Plano e resultados de testes

Cada decisão de arquitetura tem um teste que falha se ela quebrar. Todos rodam contra o sistema de pé (`docker compose up -d`), e os de integração rodam também no CI (job `integration`).

| Tipo | Onde | O que valida | ADR |
|---|---|---|---|
| Unitário | `apps/backend/**/*.spec.ts` (Jest) | regras de acesso por perfil, rate limit, formato e unicidade do protocolo, templates de e-mail | 0003, 0006 |
| Integração | `scripts/smoke-assets.sh` | (cria e apaga os próprios dados) CRUD do inventário via gateway, regras no banco (RESTRICT / SET NULL), validação, login, JWT, cabeçalho forjado, perfil responsável, bloqueio de login | 0002, 0003 |
| Integração | `scripts/smoke-tickets.sh` | abertura pública com anexo, tipo de arquivo proibido, consulta pública sem dados pessoais, fila do técnico, assumir/status/resposta, nota interna invisível, anexo só com login | 0006 |
| Integração | `scripts/smoke-scope.sh` | (cria e apaga os próprios dados) escopo do responsável (lista, detalhe, histórico, filtro por setor alheio), registro de movimentações | 0007 |
| Réplicas | `scripts/smoke-replicas.sh` | limitador compartilhado pelos gateways via Redis; 40 chamados enviados por duas réplicas do ticket-service sem e-mails duplicados | 0003, 0004 |
| Resiliência | `scripts/smoke-notify.sh` | RabbitMQ parado, SMTP parado (retry → DLQ), inventário parado | 0001, 0004 |
| Carga | `load/k6.js` (k6 em container) | capacidade com 70 usuários virtuais e comportamento do rate limit | 0003 |
| Interface | `e2e/tests/*.spec.ts` (Playwright, Chromium) | login e logout, chamado público e consulta pelo protocolo, técnico assume/responde/resolve (nota interna invisível ao cidadão), cadastro/edição/exclusão de equipamento, responsável sem botões de edição e com o termo em PDF | 0006, 0007 |
| Observabilidade | `scripts/smoke-metrics.sh` | Prometheus coleta os 4 serviços e as 3 filas do RabbitMQ, métricas por rota e status, healthcheck fora das métricas, métricas não públicas, Grafana com o painel provisionado | — |
| Deploy | `deploy/test-bluegreen.sh` | blue-green v1 → v2 → rollback com tráfego contínuo: zero falhas, sessão mantida, só a cor ativa no ar | 0008 |
| Migrações | `scripts/check-migrations.sh` | nenhuma migração apaga, renomeia ou torna obrigatório sem a marca de contração | 0008 |

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
bash scripts/smoke-metrics.sh      # Prometheus e Grafana
(cd apps/backend && npm test)

# réplicas (gateway e ticket-service): Redis compartilhado e outbox concorrente
docker compose up -d --build --wait --scale gateway=2 --scale ticket-service=2
./scripts/smoke-replicas.sh

# carga (limitador desligado só durante o teste; mantenha as réplicas ativas)
RATE_LIMIT_OFF=1 docker compose up -d gateway
set -a; . ./.env; set +a
docker run --rm -i --network gestao_ti_default -e ADMIN_EMAIL -e ADMIN_PASSWORD grafana/k6:0.54.0 run - < load/k6.js
docker compose up -d gateway       # religa o limitador
```

O limite de login (5/min por IP) vale para os scripts também. Entre rodadas seguidas, espere 1 minuto ou limpe os contadores com `docker compose exec redis redis-cli FLUSHDB` (somente em ambiente local de teste).

## Interface, observabilidade e deploy (issues #13, #14 e #17)

Os três rodam no CI em jobs próprios (`e2e`, `integration` e `deploy`).

### Testes de interface (Playwright)

```bash
docker compose up -d --build --wait
cd e2e && npm install && npx playwright install chromium
npx playwright test               # 8 testes; o relatório com prints de falha fica em e2e/playwright-report
```

Os testes criam os próprios dados com nomes únicos, então podem rodar de novo no mesmo banco. Eles fazem 3 logins: se rodar várias vezes seguidas, desligue o limitador (`RATE_LIMIT_OFF=1` no `.env`) ou espere 1 minuto.

### Observabilidade (Prometheus + Grafana)

Cada serviço expõe `/metrics` na porta interna 9464 (fora do gateway, então nada disso fica público): requisições por rota e status, histograma de latência, CPU e memória do processo. O worker conta as notificações por desfecho (enviada, repetida, retry, dlq), e o plugin `rabbitmq_prometheus` informa o tamanho de cada fila. O Grafana (http://localhost:3001) já abre no painel **Gestão de TI — visão geral**:

- linha de cima: req/s, latência p95, taxa de erro 5xx e mensagens na DLQ, os mesmos números do teste de carga;
- requisições e latência por serviço, respostas por status (429 do limitador, 503 do isolamento), rotas mais chamadas;
- filas do RabbitMQ, notificações processadas, memória e CPU.

Para ver os números do teste de carga no painel, rode o k6 (seção "Como reproduzir") com o Grafana aberto nos últimos 15 minutos.

> **Prints do painel:** _adicionar aqui os prints do Grafana durante o teste de carga e durante o `smoke-notify.sh` (DLQ subindo)._

### Deploy blue-green

```bash
IMAGE_PREFIX=local/gestao_ti TAGS="v1 v2" deploy/publish.sh --no-push   # imagens locais, sem publicar
bash deploy/test-bluegreen.sh                                            # mesmo teste do CI
```

## Não coberto

- O worker de notificações continua como instância única; sua deduplicação em memória não foi alterada nesta issue.

## Validação das issues de TaldoFernando — 23/11/2026

- `npm run lint`, 30 testes Jest e build dos quatro serviços passaram.
- O build TypeScript/Vite do front passou.
- A stack completa foi construída e executada em Compose isolado.
- `smoke-tickets.sh`, `smoke-scope.sh` e `smoke-notify.sh` validaram chamados,
  anexos, privacidade, escopo, movimentações, outbox, retry e DLQ.
- `smoke-operations.sh` valida a importação em Postgres (simulação sem escrita,
  aplicação, repetição idempotente, duplicados, conflito e rollback de setores)
  e as operações reais de DLQ com confirmação RabbitMQ e proteção CSRF.
- A API do WhatsApp foi testada com respostas simuladas, inclusive HTTP 429 e
  falhas independentes de SMTP. Não houve envio real nem cobrança no provedor.

Para repetir os novos testes após subir a stack de teste:

```sh
./scripts/smoke-operations.sh
```

Esse script pausa e religa o worker; execute os smoke tests em sequência, em
ambiente de teste. O teste de importação cria e remove somente seus dados
identificados por UUID. `COOKIE_SECURE=false` no `.env.example` permite testar
via HTTP local; a suíte Jest verifica os atributos seguros padrão do cookie.
