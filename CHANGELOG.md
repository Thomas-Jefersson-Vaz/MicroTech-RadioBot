# MikroTech V3 changelog

## Unreleased — full migration and playback reliability

- Correct Shoukaku reconnect/REST/voice timeout units.
- Replace playback races with per-guild serialization, generation cancellation, stable queue IDs, atomic queue edits, guarded prefetch and correlated terminal events.
- Preserve upcoming entries during transport failures; restart idle connected playback; report retry exhaustion and unexpectedly early endings.
- Verify Discord command registration and expose readiness failures honestly.
- Add volume, clear, jump, move, filters, private playlists, rank/leaderboard, memory deletion and explicit resume.
- Implement capped XP/cooldowns and optional Gemini/Groq chat with immediate allowlisted music actions.
- Add transactional versioned PostgreSQL migrations and persistent Redis sessions.
- Replace the hardcoded dashboard guild with selection, WebSocket playback state, drag ordering, history/playlists/XP/settings.
- Add an HTTP/WebSocket gateway, reproducible candidate audio image, environment configuration and a Portainer image-only manifest.
- Replace stale youtube-source/template documentation with project-specific setup and generated command/API references.
- Add playback, permission, storage, AI, HTTP/WebSocket and real-service integration checks, plus CI image smoke tests.
- HomeLab audible soak and confirmation of the stuttering root cause remain required before production release.

## Earlier development

The project initially used Lavalink and underwent multiple unverified quality/buffer adjustments before moving to NodeLink. Those historical attempts did not establish an audible-stuttering root cause and are not the current deployment instructions.
