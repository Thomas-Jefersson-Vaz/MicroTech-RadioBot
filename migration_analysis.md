# Análise de Migração e Lista de Funções

Este documento detalha as funcionalidades do bot monolítico "antigo" (MikroTech V2) e estabelece o plano de migração para a nova arquitetura de microserviços (MikroTech V3).

## 1. Mapeamento de Funcionalidades

### 1.1. Core Musical (Player Engine) -> Lavalink Service
O antigo "PlayerSession" será substituído por nós Lavalink.
*   **Play**: Resolução de Links e Busca (YouTube, SoundCloud, Spotify via plugins).
*   **Controles**: 
    *   `Pause`, `Resume`, `Stop`.
    *   `Skip` (Pular música atual).
    *   `Volume` (Ajuste de ganho).
*   **Fila (Queue)**:
    *   `Queue` (Visualizar).
    *   `Shuffle` (Embaralhar).
    *   `Clear` (Limpar).
    *   `Jump` (Pular para posição específica - requer lógica de lista encadeada ou array no Redis).
    *   `Move/Reorder` (Suportado pelo Dashboard antigo, crítico para o novo).
*   **Filtros de Áudio**:
    *   `Filter` (Bassboost, Nightcore, Vaporwave). *Nota: Lavalink possui suporte nativo a filtros DSP.*

### 1.2. Sistema de Dados e RPG (Backend API + Postgres)
Funcionalidades que persistem dados e engajam usuários.
*   **Sistema de XP**:
    *   Monitoramento de mensagens (`messageCreate`).
    *   Cálculo de XP (1 xp/char).
    *   Comando `/rank`.
    *   Tabela `guild_users`.
*   **Histórico de Reprodução**:
    *   Registro de todas as músicas tocadas (`history`).
    *   Comando `/history` (Geralmente últimos 10 ou link para web).
*   **Playlists Customizadas**:
    *   CRUD de Playlists de usuários (`/playlist create`, `/playlist load`).
    *   Tabelas `playlists` e `playlist_items`.

### 1.3. Inteligência Artificial (Backend Service)
Lógica atualmente no evento `messageCreate`.
*   **Chatbot**: Responde a menções "Mikrotech".
*   **Modelos**: Suporte a Gemini e Groq (Failover implementado na V2).
*   **Memória**: Contexto de conversação e tabela `user_memories`.
*   **Agente de Comandos**: Capacidade da IA de executar comandos de música (`[[COMMAND:play...]]`).

### 1.4. Dashboard (Frontend Next.js/React)
Interface visual para controle. Rework completo do antigo, algo baseado no spotify ou youtube music, controle e acompanhamento pela barra do painel, etc.
*   **Autenticação**: Login via Discord OAuth2.
*   **Controles em Tempo Real**: WebSocket/Socket.io para sincronia de estado (progresso da música, mudanças na fila).
*   **Gerenciamento Visual**: Drag & Drop da fila.

---

## 2. Tecnologias e Infraestrutura
Todos as variaveis do projeto devem ser alteaveis via .env, acessos do postgre, redis, ID/secret do discord, portas, API keys, etc.
A nova arquitetura definida no `Project` separa estas responsabilidades:

| Componente | Tecnologia V2 (Antigo) | Tecnologia V3 (Novo) | Mudança Crítica |
| :--- | :--- | :--- | :--- |
| **Audio Engine** | `@discordjs/voice` + `ffmpeg` | **Lavalink (Java)** | Requer container dedicado e cliente Lavalink (ex: Shoukaku/Lavalink-Client) no Backend. |
| **Banco de Dados** | SQLite (Histórico) + JSON (Fila RAM) | **PostgreSQL** + **Redis** | Persistência robusta e Fila compartilhada no Redis para acesso rápido. |
| **Web Server** | Express integrado (Monolito) | **Backend API** (Express/Nest) independente | API desacoplada, escalável horizontalmente. |
| **Frontend** | React (Vite) servido pelo Express | **Next.js** ou React (SPA) independente | Servidor de arquivos estáticos separado ou SSR. |

## 3. Próximos Passos (Fase 1 - Infraestrutura)

Baseado nesta análise, as tarefas imediatas de infraestrutura são:

1.  [ ] Criar `docker-compose.yml` para a stack V3 (Redis, Postgres, Lavalink).
2.  [ ] Definir esquemas do PostgreSQL (migrar tabelas `guild_users`, `history`, `playlists` do esquema antigo).
3.  [ ] Definir estruturas de dados no Redis para a Fila de Música (substituindo o array em memória do `PlayerSession`).
