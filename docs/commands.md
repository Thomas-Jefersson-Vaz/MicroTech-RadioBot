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
| /playlist | create, list, show, delete, load, add, remove | Manage your private playlists. |
| /queue | <page?> | Show upcoming tracks (10 per page). |
| /rank | <user?> | Show your server XP and level. |
| /resume |  | Resume playback or retry the retained queue. |
| /shuffle |  | Shuffle upcoming tracks. |
| /skip |  | Skip the current track. |
| /stop |  | Stop playback, clear upcoming tracks and leave voice. |
| /volume | <value> | Set and save server volume (0–100). |

Music controls require the bot’s voice channel, with a guild-administrator override.
Playlist ownership is private to the requester. Queue positions refer to upcoming tracks, starting at 1.
