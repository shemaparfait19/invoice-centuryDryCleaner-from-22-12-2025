@echo off
echo ===========================================
echo  Creating Portable Package for Distribution
echo ===========================================
echo.

set PACKAGE_DIR=CenturyDryCleaner_Portable

if exist "%PACKAGE_DIR%" (
    echo Removing existing package directory...
    rmdir /s /q "%PACKAGE_DIR%"
)

echo Creating package directory structure...
mkdir "%PACKAGE_DIR%"
mkdir "%PACKAGE%\data"

:: Copy only necessary files
echo Copying application files...
copy "docker-compose.yml" "%PACKAGE_DIR%\"
copy "Dockerfile" "%PACKAGE_DIR%\"
copy "INSTALL_AND_RUN.bat" "%PACKAGE_DIR%\"
copy "RUN_ME_FIRST.txt" "%PACKAGE_DIR%\"
copy "CREATE_PORTABLE_PACKAGE.md" "%PACKAGE_DIR%\"

:: Create a simple README
echo Creating README...
echo # Century Dry Cleaner - Portable Version > "%PACKAGE_DIR%\README.txt"
echo. >> "%PACKAGE_DIR%\README.txt"
echo This is a portable version of the Century Dry Cleaner application. >> "%PACKAGE_DIR%\README.txt"
echo. >> "%PACKAGE_DIR%\README.txt"
echo ## How to Use: >> "%PACKAGE_DIR%\README.txt"
echo 1. Double-click RUN_ME_FIRST.txt and follow the instructions >> "%PACKAGE_DIR%\README.txt"
echo 2. Then double-click INSTALL_AND_RUN.bat to start the application >> "%PACKAGE_DIR%\README.txt"

echo.
echo Creating ZIP archive...
powershell Compress-Archive -Path "%PACKAGE_DIR%\*" -DestinationPath "%PACKAGE_DIR%.zip" -Force

echo.
echo ===========================================
echo  Package created: %PACKAGE_DIR%.zip
echo  Give this file to your users along with these instructions:
echo  1. Extract the ZIP file to any folder
echo  2. Read RUN_ME_FIRST.txt
echo  3. Run INSTALL_AND_RUN.bat
echo ===========================================
echo.
pause
