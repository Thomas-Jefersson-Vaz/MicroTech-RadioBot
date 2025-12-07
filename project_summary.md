# Discord Music Bot - Project Summary & Changelog

## Current Version: v2.0.2 (Stable)

## Overview
A high-performance Discord music bot. Originally designed to be controlled via HTTP webhooks (v1.0), it is now migrated to a standalone local architecture (v2.0+) with Slash Commands, eliminating external dependencies.

---

### Active Commands
- `/play <url>`: Stable standard & HLS playback.
- `/stop`: Disconnect and clear queue.
- `/skip`: Next song.
- `/pause` / `/resume`: Instant control.
- `/queue`: Display queue.
- `/history`: Show last 10 songs (Embed).
- `/rank`: Show server XP level (Voice + Chat).
- `/volume <0-100>`: Adjust volume.
- `/filter <type> [persist]`: Apply audio effects (Hot-Reload). 
- `/version`: Show bot version.

### 🔮 Future Roadmap (Planned)
- **Web Dashboard:** Real-time web panel to track active playback sessions and queues.
- **DM Activity Reports:** System to send users a summary of their total playtime and XP across all servers via Direct Message.



## 📜 Version History (Changelog)

### v2.0.2 - The Recommendation Update (Current)
*Implemented a robust, interactive recommendation engine using YouTube Data API v3.*

**New Features:**
- **Smart Recommendations:** Uses `Artist` detection + Search API (`q="{Artist}"`) to find relevant tracks.
- **Interactive UI:** Replaced auto-play with a **Dropdown/Button Menu** allowing users to pick from top 5 unique results.
- **Filtering:** Automatically removes duplicate songs (covers/remixes) of the current track from suggestions.
- **Metadata Fix:** Recommendations now properly resolve duration before playing.


### 🤖 Recommendation System (Final)
- **Engine:** YouTube Data API v3 (Official).
- **Trigger:** When queue ends along with user interaction.
- **Interaction:** **Select Menu** with top 5 filtered results.
- **Logic:** 
  - Searches for `title mix`.
  - **Filters** out videos with the same title as the previous song to ensure variety.
  - User chooses the next track or cancels.

### v2.0.0 - The Stable "Audiophile" Update 
*Focus on stability, audio quality, and detailed user engagement.*

**Major Fixes:**
- **Playback Stability:** Solved premature track skipping by switching to a Direct Stream architecture (`yt-dlp -g` -> FFmpeg Direct Input).
- **Auto-Disconnect:**
    - Leaves channel 5s after queue ends.
    - Leaves channel immediately if bot is the sole occupant.

**New Features (Polished):**
- **XP System v2.0:**
    - **Voice XP:** 1 XP/sec tracked per active voice session.
    - **Message XP:** 1 XP/char tracked per message.
    - **Isolation:** XP is now tracked per-server (Guild ID + User ID).
    - **Rank:** Detailed breakdown (Voice % vs Chat %).
- **Hot-Reload Filters:**
    - `/filter` applies effects *immediately* by reloading the stream at the current timestamp.
    - **Bassboost:** Tuned for quality (5dB gain).

### Stack
- **Audio:** `yt-dlp` (Direct Stream resolution) + `FFmpeg` (Opus encoding)
- **Database:** `sqlite` / `sqlite3`
- **Logic:** `discord.js` v14 (Slash Commands)
- **Deployment:** Docker / Docker Compose (Standard & Portainer Stacks)

### Docker Stacks / Portainer Support
- Added `portainer-docker-compose.yaml` specifically for Portainer Stacks.
- Supports `stack.env` for environment variable injection in stack environments.




### v1.0.x - The HTTP Era (Legacy)
*The bot operated as an execution engine controlled by n8n workflows.*

**Features:**
- **Controlled via HTTP:** Exposed Express endpoints (`/play`, `/stop`, `/skip`) to allow n8n to control the bot.
- **Stateless Queue:** Queue lived in memory, managed by API calls.
- **Spotify Support:** Basic link resolution (Spotify -> YouTube) via scraping.
- **Audio Engine:** `yt-dlp` + `@discordjs/voice` with low-latency streaming.
- **Multi-Guild:** Supported multiple servers via session map.
- **Notifications:** Sent webhooks back to n8n for "Now Playing" alerts.

**Why Migrate?**
- Dependency on n8n for logic was complex to maintain.
- Latency in commands due to the HTTP roundtrip.
- Lack of native Discord command integration (Slash Commands).