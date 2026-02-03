@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"

echo.
echo  =============================================
echo   MFS Carrier+ - Watch and Deploy
echo  =============================================
echo.
echo   - Les fichiers sont rebuilds automatiquement
echo   - Copies auto vers Community2024
echo   - BEEP quand c'est pret
echo.
echo   Tu devras restart MSFS pour voir les changements.
echo   (C'est une limitation de MSFS, pas du script)
echo.
echo   Ctrl+C pour arreter.
echo  =============================================
echo.

node watch-and-deploy.js
