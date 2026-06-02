@echo off
echo Starting MikroTech Radio V3...

cd infrastructure/postgres
if not exist init.sql (
    echo [ERROR] Database init script missing!
    exit /b 1
)
cd ../..

echo [1/3] Building and Starting Infrastructure...
docker compose up -d --build

echo.
echo [INFO] API running on http://localhost:13000
echo [INFO] Dashboard running on http://localhost:13001
echo [INFO] Lavalink running on http://localhost:12333
echo.
echo use 'docker compose logs -f' to see logs.
pause
