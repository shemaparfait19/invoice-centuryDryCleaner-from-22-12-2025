@echo off
echo ===========================================
echo  Century Dry Cleaner - Installation Assistant
echo ===========================================
echo.
echo This will set up everything needed to run the application.
echo Please be patient, this may take a few minutes...
echo.

:: Check if Docker is installed
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker not found! Installing Docker Desktop...
    start "" "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
    echo.
    echo Please install Docker Desktop and restart this script.
    echo After installation, make sure to start Docker Desktop from your Start menu.
    pause
    exit /b
) else (
    echo ✅ Docker is already installed
)

echo.
echo Starting Docker containers...

docker-compose up -d

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Error starting containers. Make sure Docker Desktop is running.
    echo 1. Look for Docker in your system tray (bottom right)
    echo 2. If it's not running, start it from the Start menu
    echo 3. Right-click the Docker icon and select "Start"
    echo 4. Try running this script again
    pause
    exit /b
)

echo.
echo 🌐 Opening application in your default browser...
timeout /t 5
start http://localhost:3000

echo.
echo ===========================================
echo  Application is now running!
echo  Keep this window open while using the app.
echo ===========================================
echo.
pause
