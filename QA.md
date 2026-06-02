# MikroTech Radio V3 — Q&A

A comprehensive Q&A covering the architecture, features, setup, and technical details of the **MikroTech Radio V3** project.

---

## 🏗️ Architecture & Overview

### What is MikroTech Radio V3?
MikroTech Radio V3 is a **Discord music bot** rebuilt from a monolithic architecture (V2) into a distributed **microservices architecture** with three main layers: a **Frontend Dashboard** (Next.js), a **Backend API** (Node.js/Express), and an **Audio Engine** (Lavalink). It provides music playback control both via Discord slash commands and a web dashboard.

### Why was V3 created? What problem does it solve?
V2 was a monolith — everything (audio engine, web server, database, bot logic) ran in a single process. V3 decomposes this into isolated services for:
- **Scalability** — each component can scale independently.
- **Fault isolation** — an audio engine crash doesn't take down the API or database.
- **Better UX** — a dedicated web dashboard (inspired by Spotify/YouTube Music) gives users a rich, visual way to control playback.

### What are the main components?

| Component | Technology | Responsibility |
|:---|:---|:---|
| **Frontend** | Next.js 16 + React 19 + TypeScript + TailwindCSS | Web dashboard for queue control, playback, and auth |
| **Backend** | Node.js + Express 4 + Discord.js 14 | API server, Discord bot, orchestration layer |
| **Lavalink** | Java-based (Lavalink V4 Docker image) | Audio decoding, streaming to Discord voice channels |
| **PostgreSQL** | PostgreSQL 16 Alpine | Persistent data: settings, XP, history, playlists, AI memory |
| **Redis** | Redis Alpine | Volatile queue storage and metadata cache |

### How do the components communicate?
- **Frontend ↔ Backend**: REST API (proxied via Next.js rewrites) + future WebSocket for real-time state updates.
- **Backend ↔ Lavalink**: Shoukaku client library over WebSocket (Lavalink protocol).
- **Backend ↔ Redis**: `redis` npm package for queue operations.
- **Backend ↔ PostgreSQL**: `pg` npm package for persistent data.
- **Backend ↔ Discord**: `discord.js` library (Gateway + REST API).

---

## 🎵 Features

### What music features are supported?
- **Play** — search by name or paste direct URLs (YouTube, SoundCloud, Bandcamp, etc.)
- **Multi-URL support** — use `url1 && url2` syntax to queue multiple items in one command
- **Hybrid Playlist loading** — playlists (YouTube, Spotify, SoundCloud) are parsed via **yt-dlp** with `--flat-playlist` to fetch metadata for all tracks without pagination limits. Tracks are stored as lightweight stubs in Redis and resolved via Lavalink just-in-time right before playback.
- **Queue management** — view, shuffle, clear the queue
- **Playback controls** — pause, resume, skip, stop
- **Flags** — append `-s` (shuffle) or `-r` (reverse) to reorder tracks on the fly
- **YouTube Music fallback** — if `ytsearch` finds nothing, it retries with `ytmsearch`
- **Audio filters** — Lavalink supports DSP filters: bassboost, nightcore, vaporwave, equalizer, etc. (configured in `application.yml`)

### What Discord commands exist?
The following slash commands are implemented:
- **`/play <query>`** — Plays a song or playlist. Supports URLs, search terms, multi-URL (`&&`), and flags (`-s`, `-r`).
- **`/pause`** — Pauses or resumes playback.
- **`/skip`** — Skips the currently playing track.
- **`/stop`** — Stops playback, clears the queue, and makes the bot leave the voice channel.
- **`/queue`** — Shows the current track and list of upcoming tracks.
- **`/shuffle`** — Shuffles the tracks currently in the queue.
- **`/nowplaying`** — Displays detailed info about the currently playing track.
- **`/history`** — Displays the recent playback history retrieved from PostgreSQL.

### What API endpoints are available?

| Method | Endpoint | Auth Required | Description |
|:---|:---|:---|:---|
| `GET` | `/` | No | API info/status |
| `GET` | `/health` | No | Health check (includes Discord connection status) |
| `GET` | `/auth/discord` | No | Initiates Discord OAuth2 login |
| `GET` | `/auth/discord/callback` | No | OAuth2 callback handler |
| `GET` | `/auth/user` | No | Returns current authenticated user |
| `GET` | `/auth/logout` | No | Logs out the user |
| `GET` | `/api/queue/:guildId` | Yes | Returns the queue and current track for a guild |
| `POST` | `/api/control/:guildId/:action` | Yes | Executes a player action (`skip`, `stop`, `pause`, `resume`) |

### What planned features are not yet implemented?
Based on `migration_analysis.md` and `Project.md`:
- **XP System** — message-based XP tracking, `/rank` command, leaderboards
- **Playback History** — `/history` command, stored in PostgreSQL
- **Custom Playlists** — CRUD operations (`/playlist create`, `/playlist load`)
- **AI Chatbot** — responds to mentions, uses Gemini/Groq with failover, has conversation memory
- **AI Agent** — capability for AI to execute music commands (`[[COMMAND:play...]]`)
- **Real-time WebSocket** — live sync of playback progress and queue changes
- **Drag & Drop queue** — reorder songs visually on the dashboard
- **Additional controls** — volume, jump-to-position, move/reorder, audio filters via dashboard

---

## 🗄️ Database

### What database tables exist?

| Table | Purpose | Key Columns |
|:---|:---|:---|
| `guild_settings` | Per-guild configuration | `guild_id`, `volume_preferencial` |
| `guild_users` | XP/leveling system | `guild_id`, `user_id`, `xp`, `level` |
| `history` | Playback history log | `guild_id`, `title`, `url`, `requested_by`, `played_at` |
| `playlists` | User-created playlists | `user_id`, `name` |
| `playlist_items` | Tracks within playlists | `playlist_id`, `url`, `title`, `duration` |
| `user_memories` | AI conversation context | `user_id`, `memory_data` (JSONB) |

### How is the music queue stored?
The queue lives in **Redis**, not PostgreSQL. Each guild's queue is a Redis list with key `queue:<guildId>`. Track objects are JSON-serialized and stored as list items. Single track entries resolved through Lavalink contain full track data including the `encoded` field, whereas playlist entries resolved via the hybrid `yt-dlp` workflow are stored as lightweight stubs and resolved via Lavalink dynamically just before playing. Operations use `RPUSH` (add), `LPOP` (next), `LRANGE` (view), and `DEL` (clear).

---

## 🔐 Authentication

### How does authentication work?
- **Discord OAuth2** via Passport.js with the `passport-discord` strategy.
- The user clicks "Login with Discord" on the dashboard → redirected to Discord → authorized → redirected back with a session cookie.
- Sessions are stored server-side using `express-session` (in-memory by default).
- Protected API routes check `req.isAuthenticated()` before allowing access.
- OAuth2 scopes: `identify` and `guilds`.

### Is the session persistent?
Currently **no** — sessions are stored in-memory. Restarting the backend clears all sessions. For production, a session store like `connect-redis` should be configured.

---

## 🐳 Infrastructure & Deployment

### How is the project deployed?
Two modes are available:

1. **Full Docker** (`start.bat` / `docker-compose up`) — All 5 services run as Docker containers.
2. **Hybrid Local** (`start-local.bat`) — Infrastructure (Postgres, Redis, Lavalink) runs in Docker, while Backend and Frontend run locally with `npm run dev` for hot-reload during development.

### What Docker containers run?

| Container | Image | Port |
|:---|:---|:---|
| `mikrotech_backend` | Custom (`./backend/Dockerfile`) | `${API_PORT}` (default 3000) |
| `mikrotech_frontend` | Custom (`./frontend/Dockerfile`) | `${FRONTEND_PORT}` (default 3001) |
| `mikrotech_postgres` | `postgres:16-alpine` | `${POSTGRES_PORT}` (default 5432) |
| `mikrotech_redis` | `redis:alpine` | `${REDIS_PORT}` (default 6379) |
| `mikrotech_lavalink` | `ghcr.io/lavalink-devs/lavalink:4` | `${LAVALINK_PORT}` (default 2333) |

### What environment variables are required?
All configuration is done via `.env` (see `example.env`):

| Variable | Required | Default | Description |
|:---|:---|:---|:---|
| `DISCORD_TOKEN` | ✅ | — | Discord bot token |
| `DISCORD_CLIENT_ID` | ✅ | — | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | ✅ | — | Discord OAuth2 client secret |
| `SESSION_SECRET` | ✅ | — | Express session encryption key |
| `POSTGRES_USER` | ❌ | `admin` | Database username |
| `POSTGRES_PASSWORD` | ❌ | `admin` | Database password |
| `POSTGRES_DB` | ❌ | `mikrotech_v3` | Database name |
| `POSTGRES_PORT` | ❌ | `5432` | PostgreSQL exposed port |
| `REDIS_PORT` | ❌ | `6379` | Redis exposed port |
| `LAVALINK_PORT` | ❌ | `2333` | Lavalink exposed port |
| `LAVALINK_PASSWORD` | ❌ | `youshallnotpass` | Lavalink server password |
| `API_PORT` | ❌ | `3000` | Backend API port |
| `FRONTEND_PORT` | ❌ | `3001` | Frontend dashboard port |
| `FRONTEND_URL` | ❌ | `http://localhost:3001` | Frontend URL for OAuth2 redirects |
| `CALLBACK_URL` | ❌ | `http://localhost:3000/auth/discord/callback` | OAuth2 callback URL |
| `GUILD_ID` | ❌ | — | For instant dev command registration |
| `NODE_ENV` | ❌ | `development` | Environment mode |

---

## 🎛️ Lavalink (Audio Engine)

### What Lavalink version is used?
**Lavalink V4** (Docker image `ghcr.io/lavalink-devs/lavalink:4`) with the **YouTube plugin v1.17.0** (stable).

### What YouTube clients are configured?
`TVHTML5Embedded`, `ANDROID_MUSIC`, and `ANDROID_VR`. The `WEB` client was removed because it was causing issues.

### What audio sources are enabled?
YouTube (via plugin), Bandcamp, SoundCloud, Twitch, Vimeo, and HTTP streams. Local file playback is disabled.

### Were there any issues with Lavalink?
Yes — **stuttering playback** was a persistent problem documented in the CHANGELOG. Seven different attempts were made to fix it, including:
- Updating the YouTube plugin to the latest snapshot
- Increasing buffer durations
- Reducing opus encoding quality
- Switching YouTube client priorities
- Trying HTTP/2 and disabling DSP filters
- Testing the dev Docker image with unlimited memory
- Reverting to stable versions

The current configuration uses low quality encoding (`opusEncodingQuality: 0`) and disabled NAS (Native Audio System) for maximum stability in Docker.

### What Lavalink client library is used?
The backend uses **Shoukaku** (via the `shoukaku` npm package directly) to communicate with the Lavalink server over WebSocket.

---

## 🖥️ Frontend (Dashboard)

### What framework is the frontend built with?
**Next.js 16** with React 19, TypeScript, and TailwindCSS 4. It uses the App Router (`src/app/`).

### How does the frontend communicate with the backend?
Via **Next.js rewrites** configured in `next.config.ts`. Requests to `/api/*` and `/auth/*` are proxied to the backend (`BACKEND_INTERNAL_URL`), keeping everything on the same origin from the browser's perspective.

### What does the dashboard currently show?
- **Now Playing** section with album artwork, track title, and artist
- **Playback controls** (Play, Pause, Skip, Stop) — only visible when logged in
- **Queue list** showing all queued tracks with position number, title, author, duration, and requester
- **Login/Logout** with Discord OAuth2
- The queue auto-refreshes every 5 seconds via polling

### Is there a progress bar?
There's a visual placeholder progress bar with a pulsing animation, but it's **not functional** — it doesn't track actual playback position. Real progress tracking would require WebSocket updates from the backend.

---

## ⚙️ Backend Architecture

### How is the backend structured?

```
backend/src/
├── config/
│   ├── env.js          # Environment variable loader
│   └── passport.js     # Discord OAuth2 strategy
├── commands/
│   └── play.js         # /play slash command
├── handlers/
│   └── commandHandler.js  # Dynamic command loader & interaction router
├── routes/
│   ├── api.js          # Protected API routes (queue, controls)
│   └── auth.js         # OAuth2 login/logout/user routes
├── services/
│   ├── lavalink.js     # Shoukaku wrapper
│   ├── player.js       # Player controller (play, skip, stop, pause, queue logic)
│   └── queue.js        # Redis queue operations
└── index.js            # Main entry point
```

### How does the command system work?
The `CommandHandler` dynamically loads all `.js` files from `src/commands/` at startup. Each file exports a `command` object with a `data` property (SlashCommandBuilder) and an `execute` function. Commands are registered with Discord's REST API — guild-scoped if `GUILD_ID` is set (instant), otherwise global (up to 1h propagation delay).

### How does the readiness guard work?
The backend rejects all API requests (except `/health`, `/`, and `/auth/*`) with a **503 status** until the Discord client fires its `ready` event and all services are initialized. This prevents race conditions during startup.

### How does the player handle multiple URLs?
The `/play` command supports chaining multiple URLs or search terms with `&&`:
1. Raw query is parsed for trailing flags (`-s`, `-r`)
2. Query is split on `&&` into parts
3. All parts are resolved **in parallel** via `Promise.all`
4. Tracks are merged into a single list
5. Flags (shuffle/reverse) are applied to the merged list
6. All tracks are pushed to Redis queue in one operation
7. If no player exists for the guild, it joins the voice channel and starts playback

---

## 🐛 Known Issues & Limitations

### What are the current known issues?
1. **Lavalink stuttering** — Audio playback stuttering has been a recurring issue (partially mitigated with low quality settings)
2. **Hardcoded Guild ID** — The frontend uses a hardcoded `DEMO_GUILD_ID` for the queue display
3. **No real-time updates** — Queue updates rely on 5-second polling instead of WebSockets
4. **In-memory sessions** — User sessions are lost on backend restart
5. **Progress bar is fake** — The "Now Playing" progress bar doesn't reflect actual playback position
6. **No CORS configuration** — The backend doesn't set up CORS middleware (relies entirely on Next.js proxy)

### What migration work remains (V2 → V3)?
- XP system implementation
- Custom playlists CRUD
- AI chatbot integration (Gemini/Groq)
- AI agent command execution
- WebSocket real-time state sync
- Dashboard drag & drop queue reordering
- Volume control
- Audio filter controls via dashboard
