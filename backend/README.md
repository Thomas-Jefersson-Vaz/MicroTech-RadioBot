# MikroTech backend

Node.js 24 / Express API, Discord commands, Shoukaku/NodeLink orchestration, Redis queues/sessions and PostgreSQL migrations.

Run `npm ci`, then `npm run dev` for hybrid development or `npm start` for production. Configuration comes from the root `.env` or injected container variables.

Run `npm test` for local playback, permission, provider, HTTP/WebSocket and PostgreSQL-WASM checks. `npm run test:integration` uses real PostgreSQL/Redis when `TEST_PG_URL` and `TEST_REDIS_URL` are set. Command documentation is generated with `npm run docs:commands`.

See the [root setup guide](../README.md), [API reference](../docs/api.md) and [release validation](../docs/validation.md).
