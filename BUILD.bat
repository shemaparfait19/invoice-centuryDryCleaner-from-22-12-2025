@echo off
echo ========================================
echo   Century Dry Cleaner - Building...
echo ========================================
echo.
echo This will take a few minutes...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Building application...
call npm run build

if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo You can now run START.bat to launch the application.
echo.
pause
