# MikroTech dashboard

Next.js 16 / React 19 dashboard with Discord login, guild selection, live playback, queue reordering, playlists, history, XP and administrator settings.

Use Node.js 24. Run `npm ci` then `npm run dev`; the same-origin HTTP/WebSocket gateway listens on `FRONTEND_PORT` (default 3001). Set `BACKEND_INTERNAL_URL` to the backend endpoint.

Production: `npm run build` then `npm start`. The build prepares the standalone server and static assets; the gateway forwards API/auth/live traffic to the backend and other requests to Next's internal port (default 3002).

Checks: `npm run lint`, `npm run typecheck`, `npm run build`. Install the test browser with `npx playwright install chromium`, then run `npm run test:browser`. Browser tests use mocked authenticated API/live responses; the backend tests separately exercise the real HTTP/WebSocket gateway.

See the [root setup guide](../README.md) and [API reference](../docs/api.md).
