# Changelog - MikroTech V3

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Infrastructure**:
    - Created `docker-compose.yml` with PostgreSQL, Redis, and Lavalink services.
    - Configured `infrastructure/postgres/init.sql` with initial schemas:
        - `guild_settings`
        - `guild_users` (XP system)
        - `history`
        - `playlists` & `playlist_items`
        - `user_memories`
    - Configured `infrastructure/lavalink/application.yml` for Lavalink V4.
    - **Lavalink Stuttering Playback Fixes (Not fixed) (Troubleshooting Log)**:
        - **Attempt 1**: Updated to latest Snapshot plugin (`ab5062530eca741d13fd8d1c414ff53cde7c4448`) to resolve client extraction errors.
        - **Attempt 2**: Increased `bufferDurationMs` (10s -> 60s) to combat stuttering. Result: Failed.
        - **Attempt 3**: Reduced `opusEncodingQuality` (10 -> 0) to lower CPU usage. Result: Low quality but stutter persisted.
        - **Attempt 4**: Switched client priority (`MUSIC`, `WEB`, `ANDROID_VR`) to use stable streams.
        - **Attempt 5**: Tried experimental `http2: enabled` and disabled all DSP filters.
        - **Attempt 6**: Tested `ghcr.io/lavalink-devs/lavalink:dev` image with unlimited memory.
        - **Attempt 7**: Reverted to Stable (`1.17.0`) + Stable Docker Image (`:4`).
        - **Final Configuration (Current)**:
            - **Plugin**: Stable `1.17.0`.
            - **Clients**: `TVHTML5Embedded`, `ANDROID_MUSIC`, `ANDROID_VR` (Removed faulty `WEB` client).
            - **Buffers**: `bufferDurationMs: 2000`, `frameBufferDurationMs: 5000`.
            - **NAS**: Disabled (`nas: enabled: false`) to prevent native library conflicts in Docker.
            - **Quality**: Low (`opusEncodingQuality: 0`) for maximum stability.
- **Documentation**:
    - Created `migration_analysis.md` mapping V2 features to V3 architecture.
    - Created `CHANGELOG.md`.

### Backend Initialization
- Created `backend/` directory structure.
- Initialized `package.json` with dependencies (`express`, `discord.js`, `shoukaku`, `pg`, `redis`).
- Implemented basic service structure:
    - `src/config/env.js`: Environment variable loader.
    - `src/services/lavalink.js`: Lavalink manager wrapper.
    - `src/index.js`: Main entry point.
- **Verification**:
    - Successfully connected to Discord Gateway.
    - Successfully connected to Lavalink Node (`MikroTechNode`).
    - API listening on port 3000.
    - **Features**:
        - Implemented `/play` command with Queue Service (Redis).
        - Created `GET /api/queue/:guildId` endpoint.

### Frontend Initialization
- **Next.js**: Initialized frontend project with TypeScript & Tailwind.
- **API Proxy**: Configured `next.config.ts` to proxy requests to Backend (`localhost:3000`).
- **Dashboard**:
    - Created `Queue` component polling every 5s.
    - Implemented API client (`src/lib/api.ts`).
    - Added Auth context and Control buttons.

### Deployment / Full Run
- Created `backend/Dockerfile` and `frontend/Dockerfile`.
- Updated `docker-compose.yml` to include `backend` and `frontend` services.
- Created `start.bat` for one-click Windows execution.






### Infrastructure Status
- Docker containers (`mikrotech_postgres`, `mikrotech_redis`, `mikrotech_lavalink`) are up and running.
