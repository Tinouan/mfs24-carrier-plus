@echo off
set PATH=C:\Program Files\nodejs;%PATH%
echo === MFS Carrier+ EFB Build ===
echo.

cd /d "c:\Users\tinou\Documents\mfs24-carrier-plus\tablette ingame\PackageSources\CarrierPlus"

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    exit /b 1
)

echo.
echo Building CarrierPlus...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: build failed
    exit /b 1
)

echo.
echo === Build complete! ===
echo Output: dist\CarrierPlus.js, dist\CarrierPlus.css
