@echo off
REM ARGUS GMI - one-step start (Windows)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required - https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)
echo.
echo ARGUS GMI starting on http://localhost:3000  (Ctrl+C to stop)
call npm run dev
pause
