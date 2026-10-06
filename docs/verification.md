# Implementation verification — 2026-10-06

The approved migration is implemented locally. These checks establish application behavior and packaging, not audible playback quality on the HomeLab network.

| Check | Result |
|---|---|
| Backend `npm test` | 36 passed; no skips |
| PostgreSQL-WASM migration/storage regression | Passed, including legacy data preservation and repeat migrations |
| Real PostgreSQL 16 / Redis 7 integration | 2 passed; no skips |
| Command documentation vs central registry | Passed; 18 commands |
| Frontend lint / TypeScript / production build | Passed |
| Chromium dashboard tests | 4 passed |
| Backend / frontend / NodeLink Docker builds | Passed |
| Local and Portainer Compose manifest validation | Passed with dummy configuration |
| Standalone dashboard container homepage and static CSS | Passed |
| Backend container startup with real test storage and an invalid Discord token | Correctly rejected token, shut down and exited with status 1 |
| NodeLink 3.9.0 health and v4 WebSocket handshake | Passed |
| Actual Shoukaku initialization, session configuration and forced socket reconnect | Passed |
| Same-origin HTTP cookies and authenticated WebSocket forwarding | Passed |
| Production dependency audits (`npm audit --omit=dev`) | Backend and frontend: zero reported vulnerabilities |

Playback tests cover duplicate terminal events, consecutive copies of a song, stop during resolution, invalidated prefetch, queue preservation on transport errors, bounded repeated source/engine failures, idle restart, voice reconnection, persisted-queue resume, history deduplication, paused filters/volume, and livestream exclusions from early-ending diagnostics.

Browser tests exercise music controls and their request arguments, drag ordering, filters, permissions feedback, progress/pause, disconnect/reconnect and revision reset, guild selection, private playlist CRUD/load, memory deletion, administrator settings, and logout. They mock OAuth/API/live state rather than signing into a real Discord account. The real gateway/session behavior is checked separately.

The isolated Docker test project uses localhost ports 15432, 16379 and 12339 and separate test storage. Existing application volumes and Portainer deployments were not changed.

The frontend development-tool audit still reports five high-severity entries in the `eslint-config-next → fast-glob → micromatch → braces` chain ([braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). The production audit is clear. The suggested automatic remediation downgrades the Next lint configuration across major versions; that change was not applied. Review the upstream tooling fix before upgrading.

## Still required before release

- Real Discord OAuth and verification of the registered definitions in the target guild/global scope.
- Real Gemini/Groq calls using the configured account models.
- Portainer deployment using release image references and existing volumes.
- The 60-minute, two-guild audible soak and correlated HomeLab logs described in [validation](validation.md).

The pinned NodeLink base is a tested packaging/protocol candidate. These results do not establish that the original stuttering or early-ending report is resolved on the server.

## Cleanup verification — 2026-10-06

Removed unused dependencies and backend entry points, the empty root lockfile, the obsolete PostgreSQL initialization script and the five unused Next.js template SVGs. Architecture and useful migration notes now live in the root README. Runtime migrations, tests and compatibility settings remain intact.

The root `.gitignore` now owns the project rules, including nested environment files, private keys, test reports and coverage. Explicit environment templates and both application lockfiles remain included. `git check-ignore --no-index` verified 13 artifact/credential paths and 10 required project/template paths; no tracked files matched the ignore rules. Docker contexts exclude credentials in nested directories as well.

After cleanup: 36 backend tests and 4 Chromium tests passed, command documentation matched, lint/TypeScript/production build passed, both application images built, and both Compose manifests validated with dummy configuration. Production dependency audits remain clear. The standalone packaging includes static assets without depending on a `public` directory or redundant Docker copies.

Real PostgreSQL/Redis integration and audible Discord playback were not rerun for this cleanup. Their prior results and remaining release gates above are unchanged. Existing data, secrets and deployment volumes were not removed.
