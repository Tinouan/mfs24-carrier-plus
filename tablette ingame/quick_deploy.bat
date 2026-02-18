@echo off
set PATH=C:\Program Files\nodejs;%PATH%

echo === Quick Deploy AeroCorp Online ===
echo.

set SRC=c:\Users\tinou\Documents\AeroCorp Online\tablette ingame
set DEST=C:\Users\tinou\AppData\Local\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community2024\aerocorp-online-efb

cd /d "%SRC%\PackageSources\AeroCorpOnline"

echo [1/2] Building...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: build failed
    pause
    exit /b 1
)

echo.
echo [2/2] Deploying to Community2024...

:: Create folder structure if needed
if not exist "%DEST%\html_ui\efb_ui\efb_apps\AeroCorpOnline" mkdir "%DEST%\html_ui\efb_ui\efb_apps\AeroCorpOnline"
if not exist "%DEST%\ContentInfo\aerocorp-online-efb" mkdir "%DEST%\ContentInfo\aerocorp-online-efb"

:: Copy package metadata
copy /Y "%SRC%\manifest.json" "%DEST%\"
copy /Y "%SRC%\layout.json" "%DEST%\"
copy /Y "%SRC%\PackageDefinitions\aerocorp-online-efb\ContentInfo\thumbnail.jpg" "%DEST%\ContentInfo\aerocorp-online-efb\Thumbnail.jpg"

:: Copy built app files
set APP=%DEST%\html_ui\efb_ui\efb_apps\AeroCorpOnline
copy /Y "dist\AeroCorpOnline.js" "%APP%\"
copy /Y "dist\AeroCorpOnline.css" "%APP%\"
copy /Y "dist\airports-main.json" "%APP%\"
if exist "dist\AeroCorpOnline.js.map" copy /Y "dist\AeroCorpOnline.js.map" "%APP%\"
if exist "dist\AeroCorpOnline.css.map" copy /Y "dist\AeroCorpOnline.css.map" "%APP%\"
xcopy /Y /E "dist\Assets" "%APP%\Assets\" >nul 2>&1

echo.
echo === Done! ===
echo - Si le jeu tourne: ferme et rouvre l'app EFB
echo - Sinon: les fichiers seront charges au prochain demarrage
pause
