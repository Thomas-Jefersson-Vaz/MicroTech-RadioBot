# MikroTech Radio V3

Discord music bot and web dashboard using Node.js/Express, Discord.js, Shoukaku, NodeLink, Redis, PostgreSQL 16 and Next.js 16.

This repository implements the V2 migration: music controls, private playlists, playback history, guild XP/rank, mention-triggered Gemini/Groq chat with immediate music actions, and a live dashboard. Playback improvements are implemented; the HomeLab audible soak remains a release gate.

## Features

- Songs, searches, playlists, multiple queries separated by `&&`, and trailing `-s` / `-r` flags.
- Pause/resume, skip, stop, volume, clear, shuffle, jump, queue reordering, and reset/bassboost/nightcore/vaporwave filters.
- Private playlists with create/list/show/add/remove/delete/load.
- PostgreSQL history and guild XP: up to 200 XP per eligible message, a 60-second per-user/guild cooldown, and level `floor(sqrt(xp / 100))`.
- Gemini chat with Groq fallback when configured. Mention the bot to chat or request an allowlisted music action; no confirmation is required. Actions use the requester's live permissions.
- Guild selection, live queue/progress, drag-to-reorder, playlists, history, rank/leaderboard, and administrator volume settings.

Read the generated [command reference](docs/commands.md), [API reference](docs/api.md), [verification record](docs/verification.md), and [playback validation checklist](docs/validation.md).

Spotify links resolve metadata through NodeLink and are matched to playable sources; this is not direct Spotify audio streaming. YouTube/SoundCloud playlist metadata uses yt-dlp with audio-engine fallback. Source availability depends on the provider and the deployment network.

## Architecture

The dashboard sends Discord OAuth, API requests and live WebSocket traffic through one gateway. A shared backend action service checks permissions for Discord commands, REST controls and AI music requests. Shoukaku controls NodeLink through its Lavalink-compatible API; Redis stores queues/sessions and PostgreSQL stores persistent application data.

One backend process owns playback. Per-guild serialization and generation invalidation coordinate resolution, queue edits and track events. Prefetch is accepted only for the current queue head. Dashboard snapshots carry per-process guild revisions and resynchronize after reconnect.

The V2 migration uses capped XP with a cooldown, NodeLink instead of the former Lavalink container, structured allowlisted AI actions and environment-driven configuration. History records confirmed track starts. The remaining HomeLab release gates are documented in [validation](docs/validation.md).

## Local setup

Requires Node.js 24, Docker Compose and a Discord application.

1. Copy `example.env` to `.env`. Supply Discord credentials, a random session secret of at least 32 characters, database password and NodeLink password.
2. Enable the Discord **Message Content** intent for XP and AI chat. Invite the bot with `bot` and `applications.commands` scopes and View Channel, Send Messages, Connect and Speak permissions.
3. Add `CALLBACK_URL` to the Discord application's OAuth redirect URLs. The default is `http://localhost:3001/auth/discord/callback`.
4. Full containers: `docker compose up -d --build`, or run `start.bat`.
5. Hybrid development: run `start-local.bat`; infrastructure stays in containers, backend/dashboard run locally.

Default dashboard: http://localhost:3001. Backend diagnostics: http://localhost:3000/health. All browser API, OAuth and WebSocket traffic passes through the dashboard gateway. Database, Redis, backend diagnostics and NodeLink published ports bind to loopback by default.

Set `GUILD_ID` for a test server's command registration; leave blank for global registration. Global and guild registrations are separate Discord scopes: old registrations in another scope are not automatically deleted.

## Portainer on the HomeLab

Use **Docker Standalone**, not Swarm, for these manifests.

Build the backend, frontend and NodeLink wrapper images from this checkout on a Docker host, tag them in your registry, and push them using your existing registry credentials. Deploy [docker-compose.portainer.yml](docker-compose.portainer.yml) using Portainer's stack editor or Git integration and set:

- `BACKEND_IMAGE`, `FRONTEND_IMAGE`, `NODELINK_IMAGE`: the built release image references, preferably immutable digests.
- The required application variables from `example.env`.
- `FRONTEND_URL=https://your-dashboard-host`, `CALLBACK_URL=https://your-dashboard-host/auth/discord/callback`, `COOKIE_SECURE=true`.
- `TRUST_PROXY=1` for the included gateway; expose the dashboard behind your HTTPS reverse proxy with WebSocket upgrades enabled.
- `BUILD_REVISION` to the release commit.

Build commands:

```sh
docker build -t YOUR_REGISTRY/mikrotech-backend:RELEASE ./backend
docker build -t YOUR_REGISTRY/mikrotech-frontend:RELEASE ./frontend
docker build -t YOUR_REGISTRY/mikrotech-nodelink:RELEASE ./infrastructure/nodelink
```

The NodeLink wrapper adapts the pinned base image's own configuration using environment variables, enables player/statistics updates, and suppresses request-body/header logging. It does not require a host-mounted config file or a `stack.env` file. The local Compose manifest builds the same images.

Keep the existing Portainer stack name and PostgreSQL/Redis volumes. Back up data before the first migration. Do not recreate the database volume or use `down -v`. Existing volume credentials must match their original PostgreSQL initialization values.

## Configuration

`example.env` is the canonical configuration list. Docker/Portainer inject variables directly; hybrid development loads the root `.env`. `NODELINK_URL` selects the audio endpoint; legacy `LAVALINK_URL` and password variables remain accepted for compatibility.

AI is disabled until a provider key and explicit model are supplied: `GEMINI_API_KEY` + `GEMINI_MODEL`, and/or `GROQ_API_KEY` + `GROQ_MODEL`. Choose currently available models for your account. Conversation memory is scoped by user and guild, limited to 20 turns, expires after 30 days, and can be cleared with `/memory-clear` or the dashboard.

## Permissions and persistence

Guild members may read their server's queue/history/rank. Music controls require sharing the bot's voice channel, with an administrator override. Playlists are private to their owner. Membership is refreshed before protected actions.

Redis stores queues and login sessions; Compose enables append-only persistence. PostgreSQL stores history, playlists, XP, guild settings and AI memory. Ordered, additive migrations run transactionally at startup. Active playback is owned by one backend process; backend restart preserves upcoming tracks but does not promise restoration of the current track.

## Checks and troubleshooting

```sh
cd backend
npm ci
npm test
npm run docs:commands -- --check
npm run test:integration
cd ../frontend
npm ci
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

Real-service integration tests require `TEST_PG_URL` and `TEST_REDIS_URL` pointing to an isolated test environment; they skip when unset. CI provides PostgreSQL/Redis and builds/smoke-tests the images.

`/ready` returns 503 until Discord, Redis, PostgreSQL, command verification and an audio node are available. Registration verifies names and option definitions; failed registration remains visible and retries every minute. Commands receive an explicit unavailable response while dependencies are down.

Resume can reconnect after a voice disconnect or start the persisted upcoming queue after a backend restart. Changing filters or volume preserves pause state.

For stuttering or early endings, capture the evidence described in [validation](docs/validation.md). Recovery delays now use Shoukaku's seconds-based settings correctly. Queue edits invalidate prefetch, terminal events advance once, and stop invalidates pending resolution. These fixes do not establish the root cause of a server-side audible failure without correlated logs and listening tests.
