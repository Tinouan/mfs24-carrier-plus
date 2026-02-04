@echo off
set PATH=C:\Program Files\nodejs;%PATH%
echo === World of Aircraft EFB Build ===
echo.

cd /d "c:\Users\tinou\Documents\World-of-Aircraft\tablette ingame\PackageSources\WorldOfAircraft"

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    exit /b 1
)

echo.
echo Building WorldOfAircraft...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: build failed
    exit /b 1
)

echo.
echo === Build complete! ===
echo Output: dist\WorldOfAircraft.js, dist\WorldOfAircraft.css
