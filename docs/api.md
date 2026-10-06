# Dashboard API

All `/api/*` routes require Discord login. Guild routes verify current membership. Playback mutations additionally require the bot's voice channel; guild administrators can override. Settings mutations require Administrator. Playlist routes always use the authenticated owner's ID.

Mutations require an `Origin` matching `FRONTEND_URL`; use the same-origin dashboard gateway. JSON errors have an `error` field and appropriate 400/401/403/404/409/503 statuses.

| Method | Route | Request / response |
|---|---|---|
| GET | /auth/discord | Start OAuth with state validation |
| GET | /auth/discord/callback | Complete OAuth and redirect |
| GET | /auth/user | authenticated, sanitized user |
| POST | /auth/logout | Destroy the Redis session |
| GET | /health | Dependency and playback diagnostics |
| GET | /ready | 200 when ready, otherwise 503 |
| GET | /api/guilds | guilds shared by user and bot |
| GET | /api/queue/:guildId | guildId, revision, queue, current, playerState, playbackError, settings |
| POST | /api/control/:guildId/:action | Action arguments below |
| GET | /api/history/:guildId?limit=20 | history; limit 1–50 |
| GET | /api/rank/:guildId | Current user's guild XP and rank |
| GET | /api/leaderboard/:guildId | leaderboard, top 20 |
| GET | /api/settings/:guildId | volume |
| POST | /api/settings/:guildId | volume 0–100; administrator |
| GET | /api/playlists | Owner's playlists |
| POST | /api/playlists | name; creates a playlist |
| GET | /api/playlists/:id | Owner's playlist and ordered items |
| POST | /api/playlists/:id/items | url, optional title and duration in seconds |
| DELETE | /api/playlists/:id/items/:position | Remove one-based item position |
| DELETE | /api/playlists/:id | Delete owner's playlist |
| POST | /api/memory/:guildId/clear | Delete requester's guild AI memory |
| GET | /api/commands | Command names in this build |

Actions: `play {query}`, `skip {}`, `stop {}`, `pause {}`, `resume {}`, `volume {value}`, `filter {preset}`, `clear {}`, `shuffle {}`, `jump {position}`, `move {from,to}`, and `playlist-load {id}`.

Filters: reset, bassboost, nightcore, vaporwave. Queue positions start at 1 and exclude the playing track. Stop clears the queue and leaves voice; clear keeps the current track. Jump removes preceding upcoming entries and starts the target.

## Live playback

Connect to `ws(s)://<dashboard>/api/live?guildId=<id>` using the existing session cookie and browser origin. The connection sends full snapshots, including a monotonically increasing per-process guild revision. On reconnect, accept the new process's revision baseline before enabling controls.

Snapshots are coalesced to at most one per second, with periodic heartbeat snapshots. Membership and Redis session validity are checked before sending. The connection is read-only; mutations use REST. Slow clients and expired sessions are disconnected.
