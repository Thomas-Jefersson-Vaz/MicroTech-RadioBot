# 🎵 Discord Music Bot v2.0.2

A proprietary, high-performance music bot for Discord, built with Node.js and Discord.js v14.
Designed for stability ("Direct Stream" architecture) and user engagement (Leveling System).

> ⚠️ **Private Project:** This codebase is for internal/personal use.

## ✨ Key Features

### 🎧 Audiophile Playback
- **Direct Stream Architecture:** Bypasses legacy piping issues for stable, continuous playback.
- **Format:** High-quality Opus audio (via `yt-dlp` resolution + `ffmpeg`).
- **Supports:** YouTube (Video, Audio, Playlists).
- **Recommendation Engine (v2.0.2):**
  - **Smart Search:** Analyzes "Artist - Title" to find relevant tracks by the same artist using YouTube Data API v3.
  - **Interactive:** Presents a **Dropdown/Button Menu** with the Top 5 unique results.
  - **Anti-Duplicate:** Filters out covers or re-uploads of the same song you just heard.

### 🎚️ Advanced Audio Controls
- **/filter:** Hot-reload audio effects that apply *instantly* without restarting the song.
  - `Bassboost` (Smooth 5dB gain)
  - `Nightcore` (Pitch/Speed up)
  - `Slowed + Reverb` (Aesthetic preset)
  - **Persistence:** Option to keep filters active for the entire queue.
- **/volume:** Logarithmic volume control (0-100%).

### 🏆 XP & Leveling System (v2.0)
- **Per-Server Tracking:** XP is isolated by guild.
- **Voice XP:** Earn **1 XP/second** while active in voice channels.
- **Chat XP:** Earn **1 XP/character** for text messages.
- **/rank:** View detailed stats with Voice vs. Chat breakdown percentages.
- **/history:** View the last 10 played songs (Embed format).

### 🤖 Smart Automation
- **Auto-Disconnect:**
  - Leaves automatically 5s after the queue finishes.
  - Leaves *immediately* if the voice channel becomes empty (only bot left).

## 🚀 Installation

### Prerequisites
- Node.js v20+
- FFmpeg (Must be in system PATH or root folder)
- Python (for `yt-dlp`)

### Setup
1. **Clone & Install:**
   ```bash
   git clone <repo-url>
   cd n8n-discord-music-bot
   npm install
   ```

2. **Configuration:**
   Create a `.env` file in the root:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   YOUTUBE_API_KEY=your_youtube_v3_api_key_here
   ```

### Setup via Docker
**Image:** `tjvg4m34r13/microtech_radiobot`
**Repository:** [Docker Hub Link](https://hub.docker.com/repository/docker/tjvg4m34r13/microtech_radiobot/general)

1. **Pull & Run:**
   ```bash
   docker-compose up -d
   ```
   *Note: Ensure `.env` is present.*

2. **Database:**
   The bot automatically creates a `database.sqlite` file on first run.

### Setup via Portainer (Stacks)
1. Use the `portainer-docker-compose.yaml` content for the stack definition.
2. Upload your environment variables as a file named `stack.env` (or rename the reference in the compose file to match your stack's env file name).


## 🎮 Commands

| Command | Description |
| :--- | :--- |
| `/play <url>` | Play a song or playlist from YouTube/Spotify. |
| `/queue` | View the current queue. |
| `/skip` | Skip the current track. |
| `/stop` | Stop playback and clear the queue. |
| `/pause` | Pause playback. |
| `/resume` | Resume playback. |
| `/volume <0-100>` | Adjust volume. |
| `/filter <type>` | Apply e.g. `nightcore`, `bassboost`, etc. |
| `/rank` | Check your current level and XP stats. |
| `/version` | Show bot version info. |

## 🔮 Future Roadmap

- **🌐 Web Dashboard:** A web interface to monitor active sessions, manage queues, and view leaderboards in real-time.
- **📩 DM Reports:** Feature to request a personal activity summary (XP, Playtime) across all servers directly via Bot DM.

---
*Created by [`TJVG4M34R13`](https://github.com/Thomas-Jefersson-Vaz)*
