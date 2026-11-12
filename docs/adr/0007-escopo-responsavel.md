# ADR 0007 — Usuários no asset-service e escopo do responsável do setor

- **Status:** aceito
- **Contexto:** o responsável do setor só pode consultar os equipamentos do próprio setor. Os usuários precisam ficar em algum serviço.
- **Decisão:**
  - A tabela `User` fica no `asset-service`, porque o setor do usuário é uma chave estrangeira real para `Sector`. Não foi criado um serviço só de autenticação.
  - O escopo é aplicado **no servidor**: com `x-user-role: RESPONSAVEL`, a lista, o detalhe e o histórico de equipamentos se limitam ao setor do usuário e aos locais vinculados. Fora disso, a resposta é 404, sem revelar que o registro existe.
  - O front só organiza a tela para o perfil e não é barreira de segurança.
- **Consequências:**
  - **+** Uma regra de escopo só, num lugar só (`scope()` em `asset-service/src/main.ts`), testada em `smoke-scope.sh`.
  - **−** Se outro serviço precisar de usuários, a autenticação deve ir para um serviço próprio.
  - **−** Ainda não há edição nem desativação de usuários, nem troca de senha.
