@echo off
set PATH=C:\Program Files\nodejs;%PATH%

echo === Quick Deploy World of Aircraft ===
echo.

cd /d "c:\Users\tinou\Documents\World-of-Aircraft\tablette ingame\PackageSources\WorldOfAircraft"

echo [1/3] Building...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: build failed
    pause
    exit /b 1
)

echo.
echo [2/3] Copying to Packages folder...
set PKG=c:\Users\tinou\Documents\World-of-Aircraft\tablette ingame\Packages\world-of-aircraft-efb\html_ui\efb_ui\efb_apps\WorldOfAircraft

copy /Y "dist\WorldOfAircraft.js" "%PKG%\"
copy /Y "dist\WorldOfAircraft.css" "%PKG%\"
copy /Y "dist\WorldOfAircraft.js.map" "%PKG%\"
copy /Y "dist\WorldOfAircraft.css.map" "%PKG%\"
xcopy /Y /E "dist\Assets" "%PKG%\Assets\" >nul 2>&1

echo.
echo [3/3] Copying to Community2024 folder...
set DEST=C:\Users\tinou\AppData\Local\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community2024\world-of-aircraft-efb\html_ui\efb_ui\efb_apps\WorldOfAircraft

copy /Y "dist\WorldOfAircraft.js" "%DEST%\"
copy /Y "dist\WorldOfAircraft.css" "%DEST%\"
copy /Y "dist\WorldOfAircraft.js.map" "%DEST%\"
copy /Y "dist\WorldOfAircraft.css.map" "%DEST%\"
xcopy /Y /E "dist\Assets" "%DEST%\Assets\" >nul 2>&1

echo.
echo === Done! ===
echo - Si le jeu tourne: ferme et rouvre l'app EFB
echo - Sinon: les fichiers seront charges au prochain demarrage
pause
