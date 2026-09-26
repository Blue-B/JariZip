@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or later is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node scripts\local.mjs
if errorlevel 1 (
  echo.
  echo JariZip could not start. Read the message above. No browser data was deleted.
  pause
  exit /b 1
)
endlocal
