# ADR 0008 — Deploy blue-green com imagens publicadas pelo CI

- **Status:** aceito (issue #17)
- **Contexto:** até aqui o deploy era `docker compose up -d --build` na própria máquina: compila tudo no servidor e recria os containers de uma vez, então o sistema fica fora do ar enquanto os serviços sobem (dezenas de segundos) e não há como voltar rápido para a versão anterior. O enunciado dá pontos por uma estratégia de deploy (seção 8).
- **Decisão:**
  - **Imagens versionadas.** O CI constrói uma imagem por serviço e publica no GitHub Container Registry (`ghcr.io/<dono>/gestao_ti-<serviço>`) só depois de passarem os testes unitários, de integração, de interface e de deploy. Cada imagem leva a tag `sha-<commit>`, imutável, que é a usada no deploy, e o nome da branch (`deploy/publish.sh`).
  - **Blue-green.** Em produção (`deploy/docker-compose.prod.yml`), o front, o gateway, o ticket-service e o asset-service existem em duas cores. Um nginx de borda (`edge`) manda todo o tráfego para a cor ativa. O `deploy/deploy.sh <tag>`:
    1. sobe a versão nova na cor parada, ao lado da que está no ar;
    2. espera os healthchecks e testa ponta a ponta pelo nginx da cor nova (`/api/health` e `/api/sectors`, que passa pelo gateway e chega ao asset-service);
    3. troca o upstream da borda e faz `nginx -s reload`, que não derruba conexões: as requisições em andamento terminam na cor antiga;
    4. recria o worker com a versão nova e, depois de alguns segundos, para a cor antiga, sem apagar os containers.
  - **Rollback** (`deploy/deploy.sh rollback`): religa a cor anterior, que ainda tem os containers e a versão de antes, e devolve o tráfego para ela. Leva o tempo de os containers subirem, sem build nem download.
  - **Redes por cor.** Cada cor tem uma rede própria onde os serviços dela atendem pelos nomes de sempre (`gateway`, `ticket-service`, `asset-service`). Por isso as imagens de produção são as mesmas do `docker-compose.yml` de desenvolvimento, sem configuração diferente. Bancos, RabbitMQ e SMTP ficam numa rede compartilhada.
  - **Compartilhado entre as cores:** os dois PostgreSQL, o RabbitMQ, o volume de anexos e o `JWT_SECRET`. Quem está logado continua logado depois da troca.
- **Migrações compatíveis com duas versões no ar.** A cor nova roda `prisma migrate deploy` ao subir, enquanto a antiga ainda atende. Por isso toda migração segue o padrão **expandir e depois contrair**:
  - no deploy N só se *expande*: tabela nova, coluna opcional ou com `DEFAULT`, índice. A versão antiga ignora o que não conhece;
  - remover, renomear ou tornar uma coluna obrigatória fica para uma migração de *contração* num deploy seguinte, quando nenhuma versão no ar usa mais o campo. Essa migração é marcada no topo com `-- contract: <motivo>`;
  - um renome vira três passos: criar a coluna nova e gravar nas duas (N), migrar a leitura (N+1), apagar a antiga (N+2, contração);
  - o CI barra migração arriscada sem a marca (`scripts/check-migrations.sh`, no job `backend`).
- **Por que blue-green e não rolling:** o rolling troca réplicas uma a uma e exige várias instâncias de cada serviço. Hoje o rate limit fica em memória e o publisher do outbox assume uma instância (issue #7, ADRs 0003 e 0004). O blue-green só mantém as duas versões lado a lado durante a troca e funciona com o Docker Compose, sem Kubernetes.
- **Consequências:**
  - **+** Troca sem indisponibilidade, testada no CI (job `deploy`, `deploy/test-bluegreen.sh`): v1 → v2 → rollback com requisições contínuas na API e no front, exigindo **zero falhas**. O mesmo teste confirma que a sessão continua válida depois da troca.
  - **+** O servidor não compila nada: só baixa imagens que já passaram nos testes. A tag `sha-` diz exatamente qual commit está no ar (`deploy/deploy.sh status`).
  - **−** Durante a troca, alguns segundos com as duas versões ao mesmo tempo: dois publishers do outbox podem publicar o mesmo evento. O worker é um só e descarta o repetido pelo `messageId` (ADR 0004). Por isso ele não tem cor: é recriado, e as mensagens esperam na fila enquanto ele reinicia.
  - **−** O rate limit zera na troca, porque fica na memória do gateway.
  - **−** Precisa de memória para as duas cores durante o deploy, e a disciplina de migrações passa a ser obrigatória.
  - **−** O IP do cliente passa por dois proxies (borda e nginx do front). O gateway confia em 2 saltos em produção (`TRUST_PROXY_HOPS=2`) e em 1 no desenvolvimento. Os dois nginx acrescentam o IP no `X-Forwarded-For`, então um IP forjado pelo cliente não escapa do rate limit.
  - **Alternativas:** Kubernetes com `RollingUpdate`, que é o caminho natural com várias réplicas, mas é pesado demais para o servidor da prefeitura; Docker Swarm com `update_config: order: start-first`, que faz rolling no Compose, mas também depende de mais de uma réplica (issue #7).

## Como usar

No servidor, com Docker e o `.env` de produção na raiz do projeto:

```bash
echo <token-com-read:packages> | docker login ghcr.io -u <usuário> --password-stdin   # se o pacote for privado
deploy/deploy.sh sha-1a2b3c4        # tag publicada pelo CI (aba Packages do repositório)
deploy/deploy.sh status             # cor ativa e versão de cada cor
deploy/deploy.sh rollback           # volta para a versão anterior
```

Variáveis opcionais: `IMAGE_PREFIX` (outro registry), `HTTP_PORT` (padrão 8080), `DRAIN_SECONDS` (espera antes de parar a cor antiga, padrão 10).
