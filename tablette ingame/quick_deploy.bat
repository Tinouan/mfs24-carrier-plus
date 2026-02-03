@echo off
set PATH=C:\Program Files\nodejs;%PATH%

echo === Quick Deploy MFS Carrier+ ===
echo.

cd /d "c:\Users\tinou\Documents\mfs24-carrier-plus\tablette ingame\PackageSources\CarrierPlus"

echo [1/3] Building...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: build failed
    pause
    exit /b 1
)

echo.
echo [2/3] Copying to Packages folder...
set PKG=c:\Users\tinou\Documents\mfs24-carrier-plus\tablette ingame\Packages\mfs-carrierplus-efb\html_ui\efb_ui\efb_apps\CarrierPlus

copy /Y "dist\CarrierPlus.js" "%PKG%\"
copy /Y "dist\CarrierPlus.css" "%PKG%\"
copy /Y "dist\CarrierPlus.js.map" "%PKG%\"
copy /Y "dist\CarrierPlus.css.map" "%PKG%\"
xcopy /Y /E "dist\Assets" "%PKG%\Assets\" >nul 2>&1

echo.
echo [3/3] Copying to Community2024 folder...
set DEST=C:\Users\tinou\AppData\Local\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community2024\mfs-carrierplus-efb\html_ui\efb_ui\efb_apps\CarrierPlus

copy /Y "dist\CarrierPlus.js" "%DEST%\"
copy /Y "dist\CarrierPlus.css" "%DEST%\"
copy /Y "dist\CarrierPlus.js.map" "%DEST%\"
copy /Y "dist\CarrierPlus.css.map" "%DEST%\"
xcopy /Y /E "dist\Assets" "%DEST%\Assets\" >nul 2>&1

echo.
echo === Done! ===
echo - Si le jeu tourne: ferme et rouvre l'app EFB
echo - Sinon: les fichiers seront charges au prochain demarrage
pause
