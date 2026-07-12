@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0sunucu.ps1"

if errorlevel 1 (
  echo.
  echo Sunucu baslatilamadi. Ayrintilar yukarida goruntulenmistir.
  pause
)

endlocal
