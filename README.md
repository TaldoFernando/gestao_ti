# projeto_leilao_online

### Diagrama C4 - Nível 1: Contexto do Sistema

```mermaid
C4Context
    title Diagrama de Contexto - Sistema de Gestão de TI e Chamados da Prefeitura

    Person(cidadao, "Cidadão / Solicitante", "Abre chamados de suporte técnico via painel público sem login.")
    Person(tecnico, "Técnico de TI", "Gerencia, prioriza e responde chamados e administra o inventário.")
    Person(responsavel, "Responsável do Setor", "Consulta equipamentos do setor e emite relatórios/impressões.")

    System(sistema, "Sistema de Gestão de TI e Chamados", "Plataforma distribuída de tickets e controle patrimonial de hardware.")

    Rel(cidadao, sistema, "Abre chamados e envia mídias", "HTTPS")
    Rel(tecnico, sistema, "Gerencia chamados e inventário", "HTTPS / API")
    Rel(responsavel, sistema, "Consulta equipamentos e emite relatórios", "HTTPS")

C4Container
    title Diagrama de Containers - Microsserviços e Bancos de Dados

    Person(usuario, "Usuários", "Cidadãos, Técnicos e Responsáveis de Setor")

    System_Boundary(c_system, "Sistema da Prefeitura") {
        Container(gateway, "API Gateway", "Python / FastAPI", "Ponto único de entrada, segurança e rate-limiting.")
        
        Container(ticket_service, "Microsserviço de Chamados", "Python / FastAPI", "Gerencia abertura de tickets, mídias e painel dos técnicos.")
        Container(asset_service, "Microsserviço de Inventário", "Python / FastAPI", "Controla o cadastro de equipamentos e movimentações por setor.")
        
        Container(broker, "Broker de Mensagens", "RabbitMQ", "Processamento assíncrono de eventos (notificações).")
        
        ContainerDb(db_tickets, "Banco de Dados de Chamados", "PostgreSQL", "Armazena dados dos tickets e anexos.")
        ContainerDb(db_assets, "Banco de Dados de Inventário", "PostgreSQL", "Armazena o patrimônio e alocação de hardware.")
    }

    Rel(usuario, gateway, "Faz requisições", "HTTPS")
    Rel(gateway, ticket_service, "Encaminha rotas de chamados", "HTTP / REST")
    Rel(gateway, asset_service, "Encaminha rotas de inventário", "HTTP / REST")
    
    Rel(ticket_service, db_tickets, "Lê e grava dados", "SQL")
    Rel(asset_service, db_assets, "Lê e grava dados", "SQL")
    
    Rel(ticket_service, broker, "Publica eventos de chamado", "AMQP")
    Rel(broker, ticket_service, "Consome eventos para notificação", "AMQP")
