# ADR 0004 — Transactional Outbox + RabbitMQ com retry e DLQ

- **Status:** aceito
- **Contexto:** abrir um chamado, mudar o status ou responder deve avisar o solicitante por e-mail. Se o chamado fosse salvo e a publicação no broker falhasse, o aviso se perderia. Se a publicação acontecesse antes do commit, poderia sair um aviso de um chamado que não existe.
- **Decisão:**
  - **Outbox:** o evento é gravado na tabela `Outbox` **na mesma transação Prisma** do chamado. Um loop no `ticket-service` (`outbox.ts`) lê os pendentes a cada 2 s, publica no exchange `tickets` com *publisher confirms* e só então marca `publishedAt`.
  - **Retry:** quando o envio falha, o worker reenvia a mensagem para `notifications.retry`, uma fila com TTL de 10 s que devolve a mensagem para `notifications`.
  - **DLQ:** depois de 3 tentativas, a mensagem vai para `notifications.dlq`, com o último erro no cabeçalho `x-last-error`.
  - **Nota interna** nunca gera evento.
- **Consequências:**
  - **+** Testado: com o RabbitMQ parado, o chamado abre e o e-mail sai quando o broker volta. Com o SMTP parado, a mensagem cai na DLQ após 3 falhas (`scripts/smoke-notify.sh`).
  - **−** A entrega é *pelo menos uma vez*: se o serviço cair entre o confirm e o update, o e-mail pode sair repetido.
  - **−** Há um publisher por instância. Com réplicas, a leitura precisa de `FOR UPDATE SKIP LOCKED`.
  - **−** A reprocessamento da DLQ é manual, pelo painel do RabbitMQ.
  - **Alternativa:** CDC com Debezium, que é mais robusto, mas exige Kafka Connect, um serviço pesado demais para o escopo.
