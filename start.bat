@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm install
)
call npm run dev -- --open
pause
