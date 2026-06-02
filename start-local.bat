@echo off
echo ==========================================
echo   Starting PROD-LIKE Local Environment
echo ==========================================

echo.
echo [1/4] Stopping any running full-stack containers...
docker-compose stop backend frontend

echo.
echo [2/4] Starting Infrastructure (DB, Redis, Lavalink)...
docker-compose up --detach --force-recreate postgres redis lavalink
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo.
echo [3/5] Checking for yt-dlp...
where yt-dlp >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo yt-dlp not found. Installing via pip...
    pip install yt-dlp
    if %ERRORLEVEL% neq 0 (
        echo [WARNING] Failed to install yt-dlp. Playlist loading may be limited.
    ) else (
        echo yt-dlp installed successfully.
    )
) else (
    echo yt-dlp found.
)

echo.
echo [4/5] Starting Backend Locally...
echo Launching in new window...
start "Backend API" cmd /k "cd backend && echo Installing dependencies... && npm install && echo Starting Backend... && npm run dev"

echo.
echo [5/5] Starting Frontend Locally...
echo Launching in new window...
REM We set BACKEND_INTERNAL_URL to point to the local backend port (13000)
start "Frontend Dashboard" cmd /k "cd frontend && echo Installing dependencies... && npm install && echo Starting Frontend... && set BACKEND_INTERNAL_URL=http://localhost:13000&& npm run dev"

echo.
echo ==========================================
echo   Environment Started!
echo ==========================================
echo.
echo Backend API:       http://localhost:13000
echo Frontend:          http://localhost:3000
echo Infrastructure:    Running in Docker (postgres, redis, lavalink)
echo.
echo NOTE: Check the opened windows for logs.
echo.
pause
