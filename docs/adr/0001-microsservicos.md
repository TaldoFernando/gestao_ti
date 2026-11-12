# ADR 0001 — Arquitetura de microsserviços

- **Status:** aceito
- **Contexto:** o sistema atende dois domínios independentes: chamados de TI (abertos pelo público, atendidos por técnicos) e inventário de equipamentos (próprios e alugados, por setor). O protótipo era uma página estática com `localStorage`, sem servidor.
- **Decisão:** dividir em serviços autônomos atrás de um gateway: `ticket-service`, `asset-service` e `notification-worker`, mais o `gateway`. Todos ficam num único monorepo Nest (`apps/backend`), com um `package.json` e uma imagem Docker parametrizada por serviço (`--build-arg APP`).
- **Consequências:**
  - **+** Isolamento de falhas: com o `asset-service` fora, o chamado abre mesmo assim (o nome do setor fica vazio). O teste está em `docs/testes.md`.
  - **+** Cada serviço tem seu banco e sobe ou cai sozinho.
  - **−** Mais containers, rede e configuração do que um monólito. A consistência entre serviços é eventual: o nome do setor fica copiado no chamado e não é atualizado se o setor for renomeado.
  - **Alternativa considerada:** monólito modular em Nest. Seria mais simples de operar, mas não atenderia ao requisito da disciplina (seção 3 do enunciado).
