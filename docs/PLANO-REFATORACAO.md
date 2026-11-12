# Plano de refatoração — Sistema de Gestão de TI e Chamados (Prefeitura de Jacaraú)

Branch: `refactor/fullstack`. O `main` continua com o protótipo estático até a migração terminar.

## 1. O que o sistema faz (dos PDFs)

| Ator | O que faz | Login |
|---|---|---|
| Cidadão / servidor solicitante | Abre chamado (nome, e-mail, WhatsApp, setor, descrição, anexos) e consulta o status pelo protocolo | Não |
| Técnico de TI | Fila de chamados: assume, prioriza, muda status, responde; gerencia inventário e setores | Sim |
| Responsável do setor | Consulta equipamentos do seu setor e imprime relatório | Sim (só leitura do próprio setor) |

Domínios independentes (ADR 01): **chamados** e **inventário**. Notificação por e-mail é assíncrona (outbox + RabbitMQ).

## 2. Stack

| Camada | Tecnologia | Por quê (curto) |
|---|---|---|
| Front | React + TypeScript + Vite + Tailwind | Pedido; Vite é o build padrão, sem Next (não precisa SSR) |
| Back | NestJS em **monorepo Nest** (`nest g app`) | Um `package.json`, vários serviços; `@nestjs/microservices` já traz o transporte RabbitMQ |
| Banco | PostgreSQL + Prisma | Pedido; um schema Prisma por serviço |
| Mensageria | RabbitMQ | Já previsto no PROJETO 02 |
| Deploy | Docker Compose + GitHub Actions (CI: lint, test, build das imagens) | Exigido na entrega |

## 3. Containers (C4 nível 2)

```
web (nginx servindo o build React) ──► gateway (Nest) ──► ticket-service (Nest) ──► postgres-tickets
                                                     └─► asset-service  (Nest) ──► postgres-assets
ticket-service ──(outbox → RabbitMQ)──► notification-worker (Nest) ──► SMTP (Mailpit no dev)
```

- **gateway**: JWT (`@nestjs/jwt`), rate limit (`@nestjs/throttler`, mais rígido na rota pública de abertura), proxy para os serviços.
- **ticket-service**: chamados, anexos (volume Docker em disco), histórico de status, tabela `outbox`.
- **asset-service**: setores (hierarquia pai/filho, como já existe no `app.js`), equipamentos, movimentações, relatório por setor.
- **notification-worker**: consome `ticket.created` / `ticket.status_changed` e envia e-mail.
- 2 instâncias Postgres (database-per-service, como no PROJETO 02).

## 4. Padrões arquiteturais (mínimo 3 → 5)

1. **API Gateway** — entrada única, auth e rate limit.
2. **Database-per-service** — dois Postgres, nenhum join entre serviços.
3. **Transactional Outbox + EDA** — chamado e evento gravados na mesma transação Prisma; um poller publica no RabbitMQ.
4. **Retry + DLQ** — fila de notificação com dead-letter no RabbitMQ (configuração da fila, sem código extra).
5. **Microsserviços vs monolito** — ADR comparando com o protótipo atual.

Áreas cobertas: segurança (JWT, rate limit, secrets em `.env`), confiabilidade (outbox, DLQ), deployment (Compose + CI).

## 5. Modelo de dados

**db_assets**
- `Sector` (id, name, type, description, parentId → Sector) — igual ao protótipo
- `Equipment` (id, name, type, assetTag único, serial, ownership: PROPRIO|ALUGADO, sectorId)
- `Movement` (id, equipmentId, fromSectorId, toSectorId, at, by)
- `User` (id, name, email, passwordHash, role: TECNICO|RESPONSAVEL, sectorId?)

**db_tickets**
- `Ticket` (id, protocol único, requesterName, email, whatsapp, sectorId, equipmentTag?, title, description, priority, status: ABERTO|EM_ATENDIMENTO|AGUARDANDO|RESOLVIDO, assigneeId?, createdAt)
- `TicketEvent` (id, ticketId, type, message, authorId?, at) — histórico/respostas
- `Attachment` (id, ticketId, path, mime, size)
- `Outbox` (id, type, payload json, createdAt, publishedAt?)

`sectorId` e `equipmentTag` no chamado são só referências (sem FK entre bancos); o ticket-service valida chamando o asset-service, que responde pelo gateway.

`User` fica no asset-service para não criar um terceiro serviço só de auth. ponytail: mover para auth-service se surgir outro consumidor.

## 6. Rotas (via gateway, `/api`)

| Método | Rota | Acesso |
|---|---|---|
| POST | `/auth/login` | público |
| POST | `/tickets` (multipart) | público, rate limit |
| GET | `/tickets/protocol/:protocol` | público |
| GET/PATCH | `/tickets`, `/tickets/:id` | técnico |
| POST | `/tickets/:id/events` | técnico |
| CRUD | `/sectors`, `/equipment` | técnico (leitura: responsável do setor) |
| POST | `/equipment/:id/move` | técnico |
| GET | `/sectors/:id/report` | técnico, responsável |

Relatório: página HTML com `@media print` e `window.print()`. Sem lib de PDF.

## 7. Front-end (design E — Contraste editorial)

Tokens no `tailwind.config`: menu `#111`, fundo branco, destaque `#e6b800` só no botão principal, fontes Outfit + DM Mono (números, patrimônio, série, protocolo).

Telas:
- `/abrir-chamado` e `/acompanhar` — públicas
- `/login`
- `/painel` — visão geral (números grandes + resumo por setor)
- `/chamados` e `/chamados/:id` — fila, filtros em pílulas por status, histórico
- `/equipamentos` — tabela + pílulas por tipo + modal de cadastro (`<dialog>` nativo)
- `/setores` e `/setores/:id/relatorio`

Libs: `react-router` e `fetch` puro. Sem Redux, sem React Query, sem lib de componentes. ponytail: React Query quando houver cache/refetch de verdade.

## 8. Estrutura do repositório

```
apps/
  web/                    React + Vite + Tailwind
  backend/                monorepo Nest
    apps/gateway
    apps/ticket-service   prisma/schema.prisma
    apps/asset-service    prisma/schema.prisma
    apps/notification-worker
docs/  adr/  c4/  PLANO-REFATORACAO.md
docker-compose.yml
.github/workflows/ci.yml
.env.example
```

## 9. Etapas

| # | Entrega | Pronto quando |
|---|---|---|
| 1 | Esqueleto: monorepo Nest, Vite, `docker-compose.yml` (2 Postgres, RabbitMQ, Mailpit), CI | `docker compose up` sobe tudo; CI verde |
| 2 | asset-service: Prisma, setores, equipamentos, seed com os dados do `app.js` | CRUD via gateway funcionando |
| 3 | Auth no gateway (JWT, papéis) + rate limit | rota protegida devolve 401 sem token |
| 4 | Front: layout E, inventário e setores (substitui o protótipo) | mesmas funções do `index.html` atual |
| 5 | ticket-service: abertura pública, anexos, protocolo, fila do técnico | chamado aberto sem login aparece no painel |
| 6 | Outbox + notification-worker + DLQ | e-mail chega no Mailpit; com o worker parado, chega depois |
| 7 | Movimentações, relatório por setor, visão do responsável | relatório imprime só o setor do usuário |
| 8 | Testes e docs: integração (Jest + supertest), carga (k6 na rota pública), resiliência (derrubar asset-service e abrir chamado), ADRs, C4, README com seção "Ferramentas de IA utilizadas" | checklist da seção 7 do enunciado completo |

## 10. Divisão (sugestão do PROJETO 02, adaptada)

1. DevOps: etapas 1, 3 (gateway) e CI
2. ticket-service: etapa 5
3. Painel dos técnicos + notificações: etapas 5 (front) e 6
4. asset-service: etapas 2 e 7
5. Front do inventário, testes e documentação: etapas 4 e 8

## Fora do escopo (adicionar quando pedirem)

- WhatsApp real: o worker só envia e-mail; WhatsApp entra como um segundo handler quando houver uma API contratada.
- Kubernetes, service mesh, Vault: Compose e `.env` atendem o enunciado.
- Storage S3 para anexos: volume Docker até ter deploy em nuvem.
