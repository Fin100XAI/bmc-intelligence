@echo off
rem READY.bat - double-click to get this project running.
rem Installs packages if node_modules is missing, then starts the dashboard.
cd /d "%~dp0"
title READY - bmc intelligaqnce

if not exist node_modules (
  echo.
  echo  Installing packages for bmc intelligaqnce - please wait 2-5 minutes ^(needs internet^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Install FAILED. Check the internet connection and run READY.bat again.
    pause
    exit /b 1
  )
)
echo.
echo  Starting bmc intelligaqnce... open the http://localhost link shown below in Chrome.
echo  Keep this window open while presenting. Close it to stop.
echo.
call npm run dev
pause