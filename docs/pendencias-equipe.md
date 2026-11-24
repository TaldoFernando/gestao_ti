# Pendências que exigem participação externa

Este registro prepara a execução das issues, sem simular entrevistas, respostas,
autoria de commits, aprovação de colegas ou conclusão de atividades externas.

## #8 — Validação com o Setor de TI

Apresentar os fluxos de abertura, atendimento, inventário, movimentação e impressão.
Registrar data, participante e evidência para cada resposta:

| Assunto | Pergunta | Resposta / evidência |
|---|---|---|
| Equipamento | Marca, modelo, compra e contrato de aluguel são necessários? | Pendente |
| Estrutura | Quais secretarias, unidades e tipos de local existem? | Pendente |
| Responsabilidade | O relatório impresso serve como termo? Quais campos faltam? | Pendente |
| Chamado | Os status atuais atendem? Há SLA, prazo ou escalonamento? | Pendente |
| Migração | Quem fornece a planilha atual e autoriza a importação? | Pendente |

Ao receber as respostas, criar uma issue por mudança concreta, indicando o fluxo,
comportamento esperado e critério de aceite. O importador e o modelo CSV estão
descritos em `docs/operacao-issues.md`; a importação real ainda não foi executada.

## #21 — Perguntas ao professor (rascunho, não enviado)

1. O Projeto 02 previa Python/FastAPI. A implementação passou a TypeScript/Nest,
   conforme ADR 0005. Essa alteração é aceita para a entrega?
2. Qual duração deve prevalecer para o videocast: 12–15 minutos (seção 1.2) ou
   15–30 minutos (checklist da seção 7)?
3. O enunciado pede cinco integrantes e o Projeto 02 lista quatro. Como proceder?

Registrar aqui a resposta, data e canal da confirmação antes de concluir a issue.
**Estado:** aguardando contato e resposta do professor.

## #9 — README e apresentação

- Receber o link publicado do videocast para substituir o marcador no topo do README.
- Confirmar os nomes e a divisão efetiva de responsabilidades na tabela da equipe.
- Cada integrante revisar e acrescentar seu relato de uso de IA, inclusive avaliação
  própria. O registro de assistência do Codex foi incluído, mas não substitui esses relatos.
- Cada integrante revisar os ADRs e registrar concordância ou solicitar ajuste no PR.

Nenhum link, integrante, responsabilidade ou depoimento foi inventado.

## #23 — Contribuições e revisão

Cada integrante precisa realizar sua contribuição real, com seu próprio usuário Git.
Não reescrever autoria para produzir participação artificial.

```sh
git fetch origin
git shortlog -sn origin/refactor/fullstack
# Para conferir associação de e-mails às contas:
git shortlog -sne origin/refactor/fullstack
```

Abrir os PRs para `refactor/fullstack` e solicitar revisão de um colega. A revisão
deve ser realizada pelo próprio colega. Conferir o histórico após os merges e
antes da entrega. A existência deste documento não conclui a participação da equipe.

Auditoria da base `refactor/fullstack` em 23/11/2026 (commit
`ae5002593b2110c28da30054636ffea4e2896c07`): `git shortlog -sn` já mostra
18 commits de Gabriel Dantas De Sousa, 13 de Samuel Alves, quatro de João Vitor
Beltrão e um de Fernando d’Ávila. Isso comprova presença dos quatro nomes no
histórico, mas não a conclusão das contribuições individuais e revisões exigidas.
A equipe ainda precisa confirmar sua composição com o professor (#21).
