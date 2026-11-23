# Operação das entregas de TaldoFernando

## Sessão e CSRF (#12)

O JWT é devolvido somente em `Set-Cookie`, com `HttpOnly`, `SameSite=Strict`,
`Path=/api` e validade de oito horas. `Secure` é o padrão. A configuração
`COOKIE_SECURE=false` no `.env.example` serve apenas ao desenvolvimento HTTP local;
em produção, habilite HTTPS e configure `COOKIE_SECURE=true` e `PUBLIC_URL` com
exatamente a origem pública (protocolo, host e porta).

O front não persiste a sessão no navegador e remove o antigo `ti-session` do
localStorage. Ao recarregar, consulta `GET /api/auth/session`; o JWT continua inacessível
ao JavaScript. `POST /api/auth/logout` expira o cookie com os mesmos atributos.
Não há mais autenticação Bearer no gateway. Logout remove a sessão do navegador;
como antes, um JWT roubado ainda vale até expirar (não existe lista de revogação).

Todas as operações de escrita, inclusive login, logout e abertura pública multipart,
exigem `X-Requested-With: gestao-ti`. Esse cabeçalho força preflight em chamadas de
outra origem; o gateway não habilita CORS. Se presentes, `Origin` e Fetch Metadata
também são conferidos. Clientes CLI enviam o cabeçalho e o cookie. O nginx preserva
`Host` e informa o protocolo ao gateway. Em produção, o gateway deve ser acessível
somente pelo proxy confiável.

## Notificações em falha (#10)

O menu **Notificações**, exclusivo de técnicos, mostra protocolo, evento e
`x-last-error` da DLQ. O responsável não pode acessar a API nem por URL direta.

- `GET /api/notifications/dlq`: lista até 100 entradas e informa total.
- `POST /api/notifications/dlq/:id`: publica na fila principal com confirmação do
  broker antes de remover a original. Reinicia as tentativas e preserva os canais
  já enviados. Gera novo messageId para não ser barrado pela deduplicação.
- `DELETE /api/notifications/dlq/:id`: descarta a mensagem, com confirmação na tela.

A listagem não consome nem descarta mensagens: usa entrega sem ack e fecha o canal,
devolvendo as mensagens. Ações concorrentes podem exigir atualizar a lista. Se o
broker cair entre confirmação de publicação e ack, pode haver duplicação, conforme
a garantia de entrega pelo menos uma vez do ADR 0004. Nenhum endpoint faz purge da fila.

## WhatsApp oficial (#11)

Foi escolhido o acesso direto à **WhatsApp Cloud API da Meta**, sem intermediário.
A integração vem desligada (`WHATSAPP_ENABLED=false`). É necessário fornecer:

- token em `WHATSAPP_TOKEN` e identificador do número em `WHATSAPP_PHONE_NUMBER_ID`;
- versão Graph API suportada pela conta em `WHATSAPP_API_VERSION`, por exemplo `v23.0`;
- nome de template aprovado em `WHATSAPP_TEMPLATE` e idioma em `WHATSAPP_LANGUAGE`;
- origem pública HTTPS em `PUBLIC_URL`.

O template deve ter quatro parâmetros de texto no corpo, nessa ordem: nome do
solicitante, protocolo, atualização e link de acompanhamento. Exemplo a submeter à
Meta: “Olá {{1}}, seu chamado {{2}} tem uma atualização: {{3}}. Acompanhe: {{4}}”.
A aprovação/classificação final do template depende da Meta. Use a categoria utility
se ela corresponder ao template aprovado. Não se usa mensagem livre para iniciar
conversa fora da janela de atendimento.

Habilite somente após validar credenciais, template e autorização de recebimento dos
usuários. O número informado no formulário recebe o prefixo 55 quando há apenas DDD
brasileiro e número; números internacionais completos são preservados.

E-mail e WhatsApp são tentados independentemente. Os canais aceitos são registrados
em `x-completed-channels`; as tentativas seguintes, inclusive reenvio da DLQ, repetem
somente os pendentes. São três tentativas com a fila de espera existente. Eventos
antigos sem WhatsApp geram erro explícito se o canal estiver habilitado. A aceitação
HTTP da Meta não comprova entrega final: não há webhook de confirmação implementado.
A deduplicação em memória mantém a limitação descrita no ADR 0004 em reinícios.

**Custo:** a Meta cobra por mensagem entregue, conforme categoria e país do destinatário.
A contratação não foi efetuada nem foram ativados envios reais. Para orçamento, estime
`mensagens utility entregues no mês × tarifa vigente para Brasil`, considerando as
faixas e exceções publicadas. A tarifa deve ser confirmada pela equipe no momento da
ativação; não há valor fixo gravado no sistema.

Fontes oficiais consultadas em 23/11/2026:
[templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview),
[envio](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages),
[preços e tabela vigente](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

## Importação de patrimônio (#19)

A planilha real ainda precisa ser obtida com o Setor de TI. O modelo
`docs/importacao-patrimonio.csv` é fictício. Exporte do Excel em CSV UTF-8 com
ponto-e-vírgula (ou vírgula). Campos com delimitador ou quebra de linha devem estar
entre aspas; o parser aceita BOM e CRLF.

Colunas obrigatórias: `assetTag`, `name`, `type`, `sector`. O patrimônio é obrigatório
para garantir idempotência. Opcionais: `serial`, `ownership` (`PROPRIO`, padrão, ou
`ALUGADO`), `sectorType`, `local`, `localType`. Nomes de setor/local são procurados
sem distinguir maiúsculas. Para criar um setor/local novo, informe seu tipo; sem
tipo, um nome desconhecido gera erro. Nomes ambíguos também geram erro.

```sh
cd apps/backend
# DATABASE_URL deve apontar para o banco de patrimônio com migrações aplicadas.
# Simulação: transações são revertidas, nada é gravado.
npm run import:assets -- ../../docs/importacao-patrimonio.csv
# Confira o relatório; então aplique o arquivo real:
npm run import:assets -- /caminho/patrimonio.csv --apply
```

Na imagem Docker de produção (sem dependências de desenvolvimento), use o CLI compilado:

```sh
# Copie o CSV para o container; o DATABASE_URL já está configurado no serviço.
docker compose cp /caminho/patrimonio.csv asset-service:/tmp/patrimonio.csv
docker compose exec asset-service node dist/apps/asset-service/src/import-cli.js /tmp/patrimonio.csv
# Depois de revisar a simulação, repita com --apply.
```

Cada registro usa sua própria transação: erro em um registro não impede os demais,
e a criação dos setores da linha com erro também é revertida. O relatório informa
registros candidatos criados, ignorados e erros por número de registro (cabeçalho = 1;
campos multilinha contam como um registro). A simulação não grava nada. Saída 1 indica
erros para revisão, inclusive após aplicação parcial. Repetir a mesma importação
ignora equipamentos idênticos; patrimônio existente com dados diferentes ou repetido
no próprio CSV é informado como erro. Não há atualização silenciosa de equipamento.
Importações concorrentes usam trava transacional do Postgres.

Faça backup do banco antes da importação real. Não adicione planilhas reais ao Git.
