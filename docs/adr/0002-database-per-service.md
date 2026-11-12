# ADR 0002 — Database-per-service

- **Status:** aceito
- **Contexto:** um serviço não pode depender das tabelas de outro, senão perde a independência de deploy e de schema.
- **Decisão:** dois PostgreSQL 16 isolados (`postgres-tickets` e `postgres-assets`), cada um com seu schema Prisma (`apps/<serviço>/prisma/schema.prisma`) e suas migrações, aplicadas no boot do container (`prisma migrate deploy`). O chamado guarda `sectorId` e `equipmentTag` como **referências sem chave estrangeira**, mais uma cópia do nome do setor para exibição.
- **Consequências:**
  - **+** Os schemas evoluem separadamente, e uma migração do inventário não toca nos chamados.
  - **−** Não existe JOIN entre chamado e setor. A validação do setor é feita por chamada HTTP ao `asset-service`, com timeout de 2 s e tolerante a falha.
  - **−** Um setor renomeado não atualiza o nome já gravado nos chamados antigos. Isso é aceitável, porque o chamado registra o local no momento da abertura.
  - **Regras de negócio no banco:** "setor com locais vinculados não pode ser excluído" é `ON DELETE RESTRICT`, e "equipamento de setor excluído fica sem local" é `ON DELETE SET NULL`. O código não repete essas regras.
