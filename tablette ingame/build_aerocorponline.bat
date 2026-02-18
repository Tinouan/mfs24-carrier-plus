@echo off
set PATH=C:\Program Files\nodejs;%PATH%
echo === AeroCorp Online EFB Build ===
echo.

cd /d "c:\Users\tinou\Documents\AeroCorp Online\tablette ingame\PackageSources\AeroCorpOnline"

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    exit /b 1
)

echo.
echo Building AeroCorpOnline...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: build failed
    exit /b 1
)

echo.
echo === Build complete! ===
echo Output: dist\AeroCorpOnline.js, dist\AeroCorpOnline.css
