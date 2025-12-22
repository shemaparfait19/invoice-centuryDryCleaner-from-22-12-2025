@echo off
echo ========================================
echo   Century Dry Cleaner - Starting...
echo ========================================
echo.

REM Check if .next folder exists
if not exist ".next" (
    echo ERROR: Application not built!
    echo Please run BUILD.bat first.
    pause
    exit /b 1
)

REM Start the application
echo Starting Century Dry Cleaner...
echo.
echo Application will be available at:
echo http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

node .next/standalone/server.js

pause
