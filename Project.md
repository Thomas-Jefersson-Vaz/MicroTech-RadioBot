1. Visão Geral

O objetivo deste projeto é a decomposição do bot de música monolítico em uma arquitetura de microserviços distribuída em três camadas principais: Frontend (Dashboard), Backend (API/Orquestração) e Player (Engine de Áudio). A mudança visa escalabilidade, isolamento de falhas e melhor experiência de usuário via interface web. Todos os argumentos necessários, Chaves de API, códigos do discord ou portas de acesso devem ser settadas via .env.
2. Arquitetura de Componentes
2.1. Frontend (Dashboard)

    Tecnologia: Next.js ou React (SPA).

    Função: Interface visual para controle de reprodução, gestão de fila e configurações de guilda.

    Comunicação: REST API para comandos e WebSockets para atualização de estado da música em tempo real.


2.2. Backend (API & State)

    Tecnologia: Node.js (Express).

    Persistência: * Redis: Armazenamento volátil da fila (Queue) e cache de metadados de busca.

        PostgreSQL: Configurações persistentes, permissões de usuários e histórico.

    Segurança: Autenticação via Discord OAuth2 integrada ao fluxo do Frontend.

2.3. Player (Audio Engine)

    Tecnologia: Lavalink (Java-based) ou Node-Lavalink.

    Função: Conexão com os Voice Channels do Discord, decodificação de áudio e streaming.

    Isolamento: Executado em container separado para limitar o consumo de CPU do i3-10100 e evitar que picos de áudio afetem a API.

3. Plano de Implementação (Fases)
Fase 1: Infraestrutura e Dados

    Analizar e settar as funcoes do bot antigo e fazer a lista de funcoes necessárias

    Subir containers de suporte: Redis e PostgreSQL.

    Definir o esquema de banco de dados para salvar guild_id, volume_preferencial e last_played.

Fase 2: Backend e Integração Lavalink

    Desenvolver a API de controle.

    Implementar o Lavalink como provider de áudio.

    Configurar a lógica de "Producer/Consumer": API envia comando -> Lavalink processa áudio -> Gateway do Discord recebe o stream.

Fase 3: Frontend e Identidade

    Desenvolver Dashboard com suporte a Dark Mode.

    Implementar o fluxo de login "Identificar com Discord".

    Criar componentes de visualização da fila (Drag and Drop para reordenar músicas).