# projeto_leilao_online
## 📐 Arquitetura do Sistema (Diagrama C4)

### Nível 1: Diagrama de Contexto (System Context)

O diagrama de contexto apresenta uma visão de alto nível das interações entre os diferentes usuários/atores do município e o sistema distribuído de gestão de TI.

```mermaid
C4Context
    title Diagrama de Contexto do Sistema de Gestão de TI da Prefeitura

    Person(cidadao, "Cidadão / Solicitante", "Servidor municipal ou cidadão que solicita suporte técnico via painel público.")
    Person(tecnico, "Técnico de TI", "Equipe técnica que gerencia, atende e encerra chamados, além de administrar o inventário de hardware.")
    Person(gestor, "Responsável do Setor", "Servidor responsável por determinado setor que consulta e emite relatórios do inventário alocado.")

    System(sistema_ti, "Sistema de Gestão de TI da Prefeitura", "Plataforma distribuída responsável por centralizar o atendimento via tickets e a gestão patrimonial de hardware.")

    System_Ext(whatsapp, "Serviço de WhatsApp / E-mail", "Provedor externo de mensagens para envio de notificações e alertas.")

    Rel(cidadao, sistema_ti, "Abre chamados de suporte técnico com mídias (sem login)", "HTTPS")
    Rel(tecnico, sistema_ti, "Atende chamados e gerencia o patrimônio de equipamentos", "HTTPS")
    Rel(gestor, sistema_ti, "Consulta equipamentos do setor e gera relatórios/impressões", "HTTPS")
    Rel(sistema_ti, whatsapp, "Dispara notificações automáticas de status", "SMTP / API")

C4Container
    title Diagrama de Containers - Sistema de Gestão de TI da Prefeitura

    Person(usuario_publico, "Solicitante", "Painel Público")
    Person(usuario_admin, "Técnico / Gestor", "Painel Administrativo")

    Container_Boundary(b_sistema, "Ecossistema de Microsserviços") {
        Container(gateway, "API Gateway", "Python / FastAPI", "Ponto único de entrada, roteamento de requisições, autenticação JWT e Rate-Limiting.")
        
        Container(ticket_service, "Ticket Service", "Python (FastAPI)", "Gerencia a abertura de chamados públicos, anexos de mídias e painel de atendimento dos técnicos.")
        Container(asset_service, "Asset Service", "Python (FastAPI)", "Gerencia o cadastro de equipamentos (próprios/alugados), movimentações por setor e geração de termos/relatórios.")
        
        ContainerDb(db_tickets, "PostgreSQL Tickets", "PostgreSQL", "Armazena chamados, status, mídias e histórico de atendimentos.")
        ContainerDb(db_assets, "PostgreSQL Assets", "PostgreSQL", "Armazena dados de equipamentos, movimentações e vínculo com setores.")
        
        Container(rabbitmq, "Message Broker", "RabbitMQ", "Fila de mensagens para comunicação assíncrona e processamento em segundo plano.")
    }

    System_Ext(email_service, "Serviço de E-mail / WhatsApp", "Envio de notificações de novos chamados e atualizações de status.")

    Rel(usuario_publico, gateway, "Abre chamados e envia anexos", "HTTPS / JSON")
    Rel(usuario_admin, gateway, "Gerencia chamados e inventário", "HTTPS / JSON (JWT)")

    Rel(gateway, ticket_service, "Encaminha requisições de tickets", "HTTP / REST")
    Rel(gateway, asset_service, "Encaminha requisições de inventário", "HTTP / REST")

    Rel(ticket_service, db_tickets, "Lê e escreve dados de chamados", "SQL")
    Rel(asset_service, db_assets, "Lê e escreve dados patrimoniais", "SQL")

    Rel(ticket_service, rabbitmq, "Publica eventos (ex: ChamadoCriado)", "AMQP")
    Rel(rabbitmq, email_service, "Consome eventos para disparo de notificações", "SMTP / API")
