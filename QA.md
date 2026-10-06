# MikroTech V3 Q&A

## What runs?

An Express/Discord.js backend, a Next.js dashboard gateway, NodeLink audio engine, PostgreSQL 16 and Redis 7. NodeLink replaces the former Lavalink container; Shoukaku speaks the Lavalink-compatible protocol.

## Which features are implemented?

All commands in the generated [command reference](docs/commands.md): music controls, filters, queue editing, private playlists, history, rank/leaderboard and AI memory deletion. Mention-triggered Gemini/Groq chat and immediate allowlisted music actions are optional when credentials/models are configured.

The dashboard offers guild selection, WebSocket playback snapshots, progress, controls, drag-to-reorder, playlists, history, XP and administrator volume settings.

## What remains to validate?

The HomeLab's audible stuttering root cause and the 60-minute two-guild playback soak. Local regressions, real Redis/PostgreSQL integration, browser checks and container builds passed; see the [verification record](docs/verification.md) and [release validation](docs/validation.md).

## How are permissions enforced?

Guild membership is refreshed. Music mutations require the bot's voice channel, except for guild administrators. Settings edits require Administrator. Playlists are owner-only. AI actions use the same permissions.

## Where is state stored?

Queues and sessions: Redis with append-only persistence. History, XP, playlists, settings and user/guild AI memories: PostgreSQL. Active playback is managed by a single backend instance.

## How do I deploy?

Follow the root [README](README.md). Portainer uses prebuilt release images and injected environment variables. No stack.env or missing Lavalink application.yml is required.

## How do I diagnose missing commands?

Check `/health` for registered command names and errors, verify GUILD_ID and application ID, and confirm the invite includes applications.commands. Guild and global registrations are separate scopes.
