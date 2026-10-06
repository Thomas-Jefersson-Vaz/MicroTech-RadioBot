@echo off
setlocal
cd /d "%~dp0"
echo Starting MikroTech hybrid development...
docker compose stop backend frontend
docker compose up -d --build postgres redis nodelink
if errorlevel 1 exit /b 1
where yt-dlp >nul 2>nul
if errorlevel 1 echo Install yt-dlp for full playlist extraction; the audio engine fallback remains available.
start "MikroTech backend" cmd /k "cd /d ""%~dp0backend"" && npm ci && npm run dev"
start "MikroTech dashboard" cmd /k "cd /d ""%~dp0frontend"" && npm ci && npm run dev"
echo Dashboard: http://localhost:3001 unless FRONTEND_PORT is set in .env or the environment.
pause
