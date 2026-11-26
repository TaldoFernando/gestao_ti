# ADR 0003 — API Gateway próprio com JWT e rate limit

- **Status:** aceito
- **Contexto:** há rotas públicas (abrir e acompanhar chamado), rotas de técnico e rotas de responsável do setor. O formulário público é alvo natural de abuso.
- **Decisão:** um gateway em Nest (`apps/gateway`) que:
  1. faz o login: confere a senha (scrypt) no `asset-service` e assina um **JWT de 8 h**;
  2. aplica as regras de acesso por rota e perfil (`access.ts`, com teste unitário);
  3. **apaga os cabeçalhos `x-user-*` vindos do cliente** e injeta os do token, que os serviços usam para escopo e autoria;
  4. limita requisições por IP: login 5/min, abertura de chamado 10/min, demais rotas 300/min;
  5. repassa o corpo como stream, o que também serve para os uploads em multipart.
- **Alternativas:** Kong ou Traefik, que exigiriam plugins e configuração para regras de perfil específicas do domínio. O `@nestjs/throttler` foi descartado porque atua em controllers, e o gateway é um proxy.
- **Consequências:**
  - **+** Um ponto único de segurança, e os serviços não validam token.
  - **−** Os serviços confiam na rede interna do Docker: só o gateway e o nginx são expostos.
  - **−** O contador do rate limit fica em memória. Com mais de uma réplica do gateway, precisa ir para o Redis (marcado com `ponytail:` no código).
  - **−** O token fica no `localStorage` do front. Um cookie httpOnly seria mais seguro contra XSS (também marcado no código).
