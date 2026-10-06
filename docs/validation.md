# Playback validation and release gates

Local automated tests verify application behavior. They cannot prove audible playback on the HomeLab network.

## Before releasing

1. Record the previous backend, frontend and NodeLink image digests, build revision and Portainer stack name.
2. Back up PostgreSQL and Redis volumes. Preserve the existing stack name so Compose reuses its named volumes.
3. Run unit/database tests, real Redis/PostgreSQL integration tests, frontend checks and image builds.
4. Run `NODELINK_PASSWORD=... node backend/scripts/engine-smoke.js` against the isolated candidate engine. Supply credentials through the environment, not a logged command line.
5. Verify Discord command registration in a test guild. The health response must show all 18 commands verified. Exercise all subcommands and dashboard controls with a same-channel member, an administrator and a member outside the channel.
6. Perform a 60-minute audible soak with at least 20 transitions and two simultaneous guilds. Include YouTube singles, YouTube playlists, SoundCloud, repeated copies of a song, and a known finite-duration audio fixture published through a supported source.
7. During the soak, test skip, stop during loading, shuffle, jump, reorder, pause/resume, all filter presets, and a temporary NodeLink disconnect/restart. Verify no duplicate or accidentally discarded queue entries.
8. Require no unexplained early endings and no persistent audible stuttering. Explicit skip/stop and livestreams are excluded from duration checks.

## Evidence to capture

Collect redacted backend and audio-engine logs covering the same failure window, the track URL, expected duration, actual audible duration, image digests, host CPU/RAM usage and container restarts. Backend logs include entry IDs, playback tokens, resolution latency and terminal reasons. `GET /health` includes dependency states, engine statistics, process memory, event-loop delay and early-ending/failure counters.

An early-ending warning is diagnostic evidence, not automatic permission to replay a track or change audio quality. Correlate it with source errors, voice disconnects, event-loop/load evidence and actual listening.

## Rollout and rollback

Roll out to a test guild first. Then deploy the candidate application images to the HomeLab stack with the same volumes. Release playback stabilization before enabling AI credentials and inviting users to the expanded dashboard.

Migrations are additive and versioned. Reverting application images retains new tables/columns and existing data; do not drop tables or delete volumes during rollback. Keep a database backup for any incompatible future migration.

The NodeLink base digest in this repository is a reproducible candidate, not a declaration that the HomeLab soak has passed. Mark a release validated only after recording the tested wrapper-image digest and soak result.
