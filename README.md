# 🎵 MikroTech Radio V3

MikroTech Radio V3 is a powerful, distributed, self-hosted Discord music bot built using a modern microservices architecture. It features a rich **Next.js Web Dashboard** and a **Node.js/Express Backend** powered by the high-performance **Lavalink V4** audio engine.

This repository structure isolates the frontend dashboard, backend API and Discord bot orchestrator, and dockerized infrastructure components for maximum performance, scalability, and ease of deployment.

---

## 🏗️ Architecture Overview

MikroTech Radio V3 is split into the following services:

1. **Frontend Dashboard** (`/frontend`): A modern Web App built with Next.js 16, React 19, TypeScript, and TailwindCSS 4. It enables real-time queue monitoring and playback control directly from your browser.
2. **Backend API & Bot** (`/backend`): A Node.js service running Express and Discord.js 14. It registers Discord slash commands, coordinates state, handles authentication via Discord OAuth2, and interacts with PostgreSQL and Redis.
3. **Audio Engine** (`/infrastructure/lavalink`): Lavalink V4 handles high-fidelity audio downloading, decoding, and streaming to voice channels using the modern YouTube Source Plugin.
4. **Data Cache & Queue** (Redis): Volatile memory cache holding the playback queues for active Discord servers.
5. **Database** (PostgreSQL): Persistent storage for server configuration settings, user XP/leveling, custom playlists, and song playback history.

---

## 🚀 Features

- **Hybrid Playlist Loading**: Parses YouTube, Spotify, and SoundCloud playlists using `yt-dlp` to bypass standard YouTube page and rate limits. Resolves tracks just-in-time dynamically before playing to ensure near-instant queueing.
- **Multi-URL & Flag Support**: Chain queries using `&&` (e.g. `url1 && url2`) and append `-s` to shuffle or `-r` to reverse on the fly.
- **Discord Slash Commands**: Rich integration with Discord using `/play`, `/pause`, `/skip`, `/stop`, `/queue`, `/shuffle`, `/nowplaying`, and `/history`.
- **Express API & Next.js Proxy**: Secure, session-based control API with Discord OAuth2 login, proxied seamlessly to prevent CORS issues.
- **Low-Latency Streaming**: Pre-buffered audio streams with Native Audio System (NAS) settings adjusted for high container performance.

---

## 🛠️ Quick Start

### Prerequisites
- [Docker & Docker Compose](https://www.docker.com/)
- [Node.js v20+](https://nodejs.org/)
- [Python 3.x](https://www.python.org/) & `pip` (only for local development)
- A Discord Bot Token (created via the [Discord Developer Portal](https://discord.com/developers/applications))

### 1. Configuration
Copy the template environment file in the root:
```bash
cp example.env .env
```
Open `.env` and fill in your credentials:
- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `GUILD_ID` (Optional, for instant slash command registration during development)

### 2. Run the Environment

#### Option A: Hybrid Local Development (Recommended for Devs)
This mode runs database, cache, and audio servers in Docker while hosting the Next.js frontend and Express backend locally with hot-reloading (`npm run dev`).

Run the automated script:
```bash
.\start-local.bat
```
*Note: This script will verify if `yt-dlp` is installed in your PATH and attempt to install it via `pip` if missing.*

#### Option B: Full Production-like Containers
This mode runs all services, including frontend and backend, inside Docker containers.
```bash
.\start.bat
```

Once running:
- **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:13000](http://localhost:13000)
- **Lavalink WebSocket**: [http://localhost:12333](http://localhost:12333)

---

## 📂 Project Structure

```
Mikrotech-Radio.new/
├── backend/                  # Node.js/Express API & Discord Bot
│   ├── src/
│   │   ├── commands/         # Discord slash commands
│   │   ├── services/         # Queue, Lavalink, and yt-dlp orchestrations
│   │   └── handlers/         # Event and command routers
│   └── Dockerfile
├── frontend/                 # Next.js web application
│   ├── src/app/              # Dashboard pages & UI components
│   └── Dockerfile
├── infrastructure/           # Docker database & engine configurations
│   ├── lavalink/             # application.yml settings for Lavalink
│   └── postgres/             # init.sql schema initializations
├── docker-compose.yml        # Orchestration manifest
└── start-local.bat           # Automated hybrid developer startup script
```

---

## 📝 Slash Commands

- `/play <query>`: Play a track/playlist from YouTube, Spotify, SoundCloud, or search text.
- `/pause`: Toggle play/pause state.
- `/skip`: Skip the current track.
- `/stop`: Stop the player, clear the queue, and disconnect.
- `/queue`: Display the current playback queue.
- `/shuffle`: Shuffle the active queue.
- `/nowplaying`: Show details of the currently playing track.
- `/history`: Review recently played tracks stored in the PostgreSQL database.
