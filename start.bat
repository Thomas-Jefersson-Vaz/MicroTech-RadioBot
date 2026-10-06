@echo off
setlocal
cd /d "%~dp0"
echo Starting MikroTech Radio V3...
docker compose up -d --build
if errorlevel 1 exit /b 1
echo Dashboard: use FRONTEND_URL from .env (default http://localhost:3001)
echo Logs: docker compose logs -f backend nodelink
pause
