# Discord command reference

Generated from the command registry using `npm run docs:commands` in backend.

| Command | Options/subcommands | Behavior |
|---|---|---|
| /clear |  | Clear upcoming tracks, keeping the current song. |
| /filter | <preset> | Replace the audio filter preset. |
| /history | <count?> | Show recent server playback history. |
| /jump | <position> | Start an upcoming track, discarding preceding entries. |
| /leaderboard |  | Show the top 20 members by server XP. |
| /memory-clear |  | Delete your AI conversation memory in this server. |
| /move | <from>, <to> | Move an upcoming track to another position. |
| /nowplaying |  | Show the current song and actual playback position. |
| /pause |  | Toggle pause and resume. |
| /play | <query> | Play a song, URL or playlist; supports &&, -s and -r. |
| /playlist | create <name>, list <page?>, show <id> <page?>, delete <id>, load <id>, add <id> <url> <title?>, remove <id> <position> | Manage your private playlists. |
| /queue | <page?> | Show upcoming tracks (10 per page). |
| /rank | <user?> | Show your server XP and level. |
| /resume |  | Resume playback or retry the retained queue. |
| /shuffle |  | Shuffle upcoming tracks. |
| /skip |  | Skip the current track. |
| /stop |  | Stop playback, clear upcoming tracks and leave voice. |
| /volume | <value> | Set and save server volume (0–100). |

Music controls require the bot’s voice channel, with a guild-administrator override.
Playlist ownership is private to the requester. Queue positions refer to upcoming tracks, starting at 1.

Now playing cards use Discord Components V2 and check progress every 15 seconds, editing only when the displayed state changes. Playback, queue, volume, filter and connection changes update immediately. Cards include pause/resume, skip, volume −/＋ (10-point steps), and stop controls. Stop clears the queue and disconnects voice. Controls use the same voice-channel permissions as music commands.

Playback started through `/play`, `/playlist load`, or an AI request automatically posts a card in the originating channel for each new track. Adding tracks does not change that channel. `/nowplaying` replaces the active card in the requesting channel without changing where subsequent automatic cards appear. Only one card per server remains active; previous cards remain in channel history with disabled controls when replaced or when their track ends. Each song receives its own message; rapid transitions retain intermediate songs instead of reusing a session-wide message.

Card sessions end when playback is stopped or the queue finishes, and are not restored after a bot restart. Old controls then require a fresh `/nowplaying` query.

The panel reads only the queue count and first entry. A deleted message is not recreated automatically for the same track; an explicit `/nowplaying` can create another panel. Temporary edit failures are retried only on a later update; ambiguous send failures suspend automatic reposting of that track to avoid duplicates. Channel and permission errors are logged without interrupting audio.

Legacy embeds are preserved and their controls disabled; replacement panels are sent as new V2 messages, never converted in place. Graceful shutdown finalizes tracked panels before disconnecting Discord.

For Portainer, rebuild and deploy the backend image by digest, preserve the existing stack name and volumes, and keep one bot instance. Stop the old backend gracefully before starting the new one. Its current shutdown deadline is ten seconds; network failures or forced termination may leave old controls visually enabled, but those controls remain invalid after restart. Sessions are not restored: use `/nowplaying` to create a fresh panel. Verify `/ready`, all five controls, track transitions and preserved history in a test guild before production. No frontend, NodeLink or database migration is required for this change.
