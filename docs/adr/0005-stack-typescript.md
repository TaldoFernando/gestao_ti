# ADR 0005 — Stack em TypeScript (substitui Python/FastAPI do Projeto 02)

- **Status:** aceito (substitui a stack proposta no Projeto 02)
- **Contexto:** o Projeto 02 previa FastAPI e SQLAlchemy. Na refatoração, a equipe decidiu usar uma linguagem só no front e no back.
- **Decisão:** React, TypeScript, Vite e Tailwind no front; NestJS no back; Prisma como ORM; PostgreSQL; RabbitMQ (`amqplib`); Docker Compose; GitHub Actions.
- **Por quê:**
  - Tipos compartilhados mentalmente entre front e back, e um ecossistema só.
  - Nest dá injeção de dependência, validação (`class-validator`) e monorepo prontos.
  - Prisma gera migrações SQL versionadas e um cliente tipado por serviço.
- **O que ficou de fora de propósito:**
  - **Redux e React Query:** o `fetch` com estado local basta.
  - **Biblioteca de componentes:** o `<dialog>` nativo resolve foco, Esc e o fundo escurecido.
  - **Biblioteca de PDF:** o relatório é HTML com `@media print`.
  - **Transporte de microsserviços do Nest:** não deixa controlar o retry e a DLQ, por isso o worker usa `amqplib` direto.
- **Consequências:** **−** o Prisma exige `prisma generate` no build, resolvido no `postinstall`. **−** Dois clientes Prisma no mesmo `node_modules`, resolvido com outputs separados (`.prisma/asset` e `.prisma/ticket`).
