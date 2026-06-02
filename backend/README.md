# MikroTech Backend (API & Orchestrator)

This is the Node.js backend service for MikroTech Radio V3. It handles:
- Discord Gateway connection (interactions).
- Lavalink audio node management.
- REST API for the Dashboard.
- Database orchestration (Postgres/Redis).

## Setup

1.  Ensure infrastructure is running:
    ```bash
    cd ..
    docker compose up -d
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure `.env` in the project root.

## Running

```bash
npm start
```
The API will start on port `3000` (default) and connect to Lavalink on port `2333`.
