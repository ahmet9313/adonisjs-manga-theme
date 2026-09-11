@echo off
setlocal
cd /d "%~dp0"
title MangaHub Baslatici

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "START_EXIT=%ERRORLEVEL%"

if not "%START_EXIT%"=="0" (
  echo.
  echo [start] Baslatma basarisiz oldu. Yukaridaki hata mesajini kontrol edin.
  pause
)

exit /b %START_EXIT%
