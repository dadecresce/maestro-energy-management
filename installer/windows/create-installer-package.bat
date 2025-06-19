@echo off
setlocal

:: Create installer package for distribution

title Maestro Installer Package Creator

echo.
echo ========================================
echo  Maestro Installer Package Creator
echo ========================================
echo.

:: Set paths
set "SOURCE_DIR=%~dp0"
set "OUTPUT_DIR=%SOURCE_DIR%\MaestroInstaller"
set "ZIP_NAME=Maestro-Energy-Management-Windows-Installer.zip"

echo Creating installer package...
echo.

:: Create output directory
if exist "%OUTPUT_DIR%" (
    rmdir /s /q "%OUTPUT_DIR%"
)
mkdir "%OUTPUT_DIR%"

:: Copy installer files
echo [1/4] Copying installer files...
copy "%SOURCE_DIR%\install.bat" "%OUTPUT_DIR%\" >nul
copy "%SOURCE_DIR%\uninstall.bat" "%OUTPUT_DIR%\" >nul
copy "%SOURCE_DIR%\README.md" "%OUTPUT_DIR%\" >nul

:: Copy main documentation
echo [2/4] Copying documentation...
copy "%SOURCE_DIR%\..\..\WINDOWS_SETUP_GUIDE.md" "%OUTPUT_DIR%\" >nul

:: Create quick start instructions
echo [3/4] Creating quick start file...
echo # Maestro Energy Management - Quick Start > "%OUTPUT_DIR%\QUICK_START.txt"
echo. >> "%OUTPUT_DIR%\QUICK_START.txt"
echo INSTALLATION: >> "%OUTPUT_DIR%\QUICK_START.txt"
echo 1. Ensure Node.js 18+ and Git are installed >> "%OUTPUT_DIR%\QUICK_START.txt"
echo 2. Right-click install.bat and "Run as administrator" >> "%OUTPUT_DIR%\QUICK_START.txt"
echo 3. Follow the installation wizard >> "%OUTPUT_DIR%\QUICK_START.txt"
echo 4. Configure your Tuya credentials when prompted >> "%OUTPUT_DIR%\QUICK_START.txt"
echo 5. Launch from desktop shortcut >> "%OUTPUT_DIR%\QUICK_START.txt"
echo. >> "%OUTPUT_DIR%\QUICK_START.txt"
echo REQUIREMENTS: >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Windows 10/11 >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Node.js 18+ (https://nodejs.org) >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Git (https://git-scm.com) >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Administrator privileges >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Internet connection >> "%OUTPUT_DIR%\QUICK_START.txt"
echo. >> "%OUTPUT_DIR%\QUICK_START.txt"
echo SUPPORT: >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Read README.md for detailed instructions >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Check WINDOWS_SETUP_GUIDE.md for troubleshooting >> "%OUTPUT_DIR%\QUICK_START.txt"
echo - Visit: https://github.com/dadecresce/maestro-energy-management >> "%OUTPUT_DIR%\QUICK_START.txt"

:: Create version info
echo [4/4] Creating version info...
echo Maestro Energy Management Windows Installer > "%OUTPUT_DIR%\VERSION.txt"
echo Version: 1.0.0 >> "%OUTPUT_DIR%\VERSION.txt"
echo Build Date: %date% %time% >> "%OUTPUT_DIR%\VERSION.txt"
echo Compatible with: Windows 10/11 >> "%OUTPUT_DIR%\VERSION.txt"
echo Requires: Node.js 18+, Git >> "%OUTPUT_DIR%\VERSION.txt"
echo. >> "%OUTPUT_DIR%\VERSION.txt"
echo Repository: https://github.com/dadecresce/maestro-energy-management >> "%OUTPUT_DIR%\VERSION.txt"

echo.
echo ========================================
echo  PACKAGE CREATED SUCCESSFULLY!
echo ========================================
echo.
echo Installer package location:
echo %OUTPUT_DIR%
echo.
echo Files included:
echo - install.bat (Main installer)
echo - uninstall.bat (Uninstaller)
echo - README.md (Detailed instructions)
echo - WINDOWS_SETUP_GUIDE.md (Setup guide)
echo - QUICK_START.txt (Quick start instructions)
echo - VERSION.txt (Version information)
echo.
echo To distribute:
echo 1. Zip the MaestroInstaller folder
echo 2. Share the zip file with users
echo 3. Users extract and run install.bat as administrator
echo.
echo Would you like to open the package folder? (y/n)
set /p OPEN_FOLDER="Enter choice: "
if /i "%OPEN_FOLDER%"=="y" (
    explorer "%OUTPUT_DIR%"
)
echo.
echo Package creation complete!
pause