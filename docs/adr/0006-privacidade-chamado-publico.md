# ADR 0006 — Protocolo aleatório e dados mínimos na consulta pública

- **Status:** aceito
- **Contexto:** o cidadão acompanha o chamado sem login, só pelo protocolo. Com um número sequencial, qualquer pessoa leria os chamados dos outros trocando o número (enumeração).
- **Decisão:**
  - O protocolo tem o formato `JAC-XXXX-XXXX`: 8 caracteres aleatórios (`crypto.randomBytes`) de um alfabeto de 32 símbolos, sem O, 0, I e 1, o que dá cerca de 10¹² combinações. A busca aceita letras minúsculas.
  - A rota pública devolve só o título, o status, o setor, as datas e os eventos públicos. **Nunca** devolve e-mail, WhatsApp, anexos nem notas internas (testado em `smoke-tickets.sh`).
  - Os anexos só são baixados com login, com `content-type` fixo e `nosniff`. São aceitos apenas fotos, PDF e vídeo, com até 5 arquivos de 20 MB.
- **Consequências:**
  - **+** Não dá para enumerar chamados, e a exposição de dados é mínima.
  - **−** O protocolo é maior que um número e precisa ser guardado pelo cidadão, que o recebe por e-mail.
  - **+** A colisão (cerca de 1 em 10¹²) é tratada: o banco recusa o protocolo repetido (`@unique`, erro P2002) e a abertura tenta de novo com outro protocolo, até 5 vezes (`withUniqueProtocol` em `protocol.ts`).
