@echo off
setlocal enabledelayedexpansion

:: Maestro Energy Management System - Windows Installer
:: Version 1.0.0

title Maestro Energy Management - Windows Installer

echo.
echo ========================================
echo  Maestro Energy Management System
echo  Windows Installer v1.0.0
echo ========================================
echo.

:: Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This installer requires administrator privileges.
    echo Please run as administrator and try again.
    echo.
    pause
    exit /b 1
)

echo [INFO] Administrator privileges confirmed.
echo.

:: Set installation directory
set "INSTALL_DIR=%ProgramFiles%\Maestro Energy Management"
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\Maestro Energy Management.lnk"
set "STARTMENU_SHORTCUT=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Maestro Energy Management.lnk"

echo [INFO] Installation directory: %INSTALL_DIR%
echo.

:: Check if Node.js is installed
echo [1/7] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo.
    echo Please install Node.js 18+ from https://nodejs.org/
    echo Choose the LTS version and ensure "Add to PATH" is checked.
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo [OK] Node.js found: !NODE_VERSION!
)
echo.

:: Check if Git is installed
echo [2/7] Checking Git installation...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo.
    echo Please install Git from https://git-scm.com/download/win
    echo Use default settings during installation.
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('git --version') do set GIT_VERSION=%%i
    echo [OK] Git found: !GIT_VERSION!
)
echo.

:: Install pnpm
echo [3/7] Installing pnpm package manager...
npm install -g pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install pnpm.
    pause
    exit /b 1
) else (
    echo [OK] pnpm installed successfully.
)
echo.

:: Create installation directory
echo [4/7] Creating installation directory...
if exist "%INSTALL_DIR%" (
    echo [INFO] Removing existing installation...
    rmdir /s /q "%INSTALL_DIR%"
)
mkdir "%INSTALL_DIR%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create installation directory.
    pause
    exit /b 1
) else (
    echo [OK] Installation directory created.
)
echo.

:: Clone the repository
echo [5/7] Downloading Maestro Energy Management...
cd /d "%INSTALL_DIR%"
git clone https://github.com/dadecresce/maestro-energy-management.git . >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Failed to download the application.
    echo Please check your internet connection.
    pause
    exit /b 1
) else (
    echo [OK] Application downloaded successfully.
)
echo.

:: Install dependencies
echo [6/7] Installing dependencies (this may take 2-3 minutes)...
pnpm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
) else (
    echo [OK] Dependencies installed successfully.
)
echo.

:: Create environment files
echo [7/7] Setting up configuration files...
copy ".env.example" ".env" >nul 2>&1
copy "apps\backend\.env.example" "apps\backend\.env" >nul 2>&1
copy "apps\frontend\.env.example" "apps\frontend\.env" >nul 2>&1
echo [OK] Configuration files created.
echo.

:: Create launcher scripts
echo [INFO] Creating launcher scripts...

:: Create backend launcher
echo @echo off > "%INSTALL_DIR%\start-backend.bat"
echo title Maestro Backend Server >> "%INSTALL_DIR%\start-backend.bat"
echo cd /d "%INSTALL_DIR%\apps\backend" >> "%INSTALL_DIR%\start-backend.bat"
echo echo Starting Maestro Backend Server... >> "%INSTALL_DIR%\start-backend.bat"
echo echo Backend will be available at http://localhost:3001 >> "%INSTALL_DIR%\start-backend.bat"
echo echo. >> "%INSTALL_DIR%\start-backend.bat"
echo npm run dev:simple >> "%INSTALL_DIR%\start-backend.bat"

:: Create frontend launcher
echo @echo off > "%INSTALL_DIR%\start-frontend.bat"
echo title Maestro Frontend Server >> "%INSTALL_DIR%\start-frontend.bat"
echo cd /d "%INSTALL_DIR%\apps\frontend" >> "%INSTALL_DIR%\start-frontend.bat"
echo echo Starting Maestro Frontend Server... >> "%INSTALL_DIR%\start-frontend.bat"
echo echo Frontend will be available at http://localhost:3000 >> "%INSTALL_DIR%\start-frontend.bat"
echo echo. >> "%INSTALL_DIR%\start-frontend.bat"
echo npm run dev >> "%INSTALL_DIR%\start-frontend.bat"

:: Create main launcher
echo @echo off > "%INSTALL_DIR%\Maestro.bat"
echo title Maestro Energy Management System >> "%INSTALL_DIR%\Maestro.bat"
echo echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo ======================================== >> "%INSTALL_DIR%\Maestro.bat"
echo echo  Maestro Energy Management System >> "%INSTALL_DIR%\Maestro.bat"
echo echo ======================================== >> "%INSTALL_DIR%\Maestro.bat"
echo echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo [INFO] Starting Maestro servers... >> "%INSTALL_DIR%\Maestro.bat"
echo echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo [1] Starting Backend Server (Port 3001)... >> "%INSTALL_DIR%\Maestro.bat"
echo start "Maestro Backend" "%INSTALL_DIR%\start-backend.bat" >> "%INSTALL_DIR%\Maestro.bat"
echo timeout /t 5 /nobreak ^>nul >> "%INSTALL_DIR%\Maestro.bat"
echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo [2] Starting Frontend Server (Port 3000)... >> "%INSTALL_DIR%\Maestro.bat"
echo start "Maestro Frontend" "%INSTALL_DIR%\start-frontend.bat" >> "%INSTALL_DIR%\Maestro.bat"
echo timeout /t 3 /nobreak ^>nul >> "%INSTALL_DIR%\Maestro.bat"
echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo [3] Opening Maestro in your default browser... >> "%INSTALL_DIR%\Maestro.bat"
echo timeout /t 8 /nobreak ^>nul >> "%INSTALL_DIR%\Maestro.bat"
echo start http://localhost:3000 >> "%INSTALL_DIR%\Maestro.bat"
echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo ======================================== >> "%INSTALL_DIR%\Maestro.bat"
echo echo  Maestro is now running! >> "%INSTALL_DIR%\Maestro.bat"
echo echo  Frontend: http://localhost:3000 >> "%INSTALL_DIR%\Maestro.bat"
echo echo  Backend:  http://localhost:3001 >> "%INSTALL_DIR%\Maestro.bat"
echo echo ======================================== >> "%INSTALL_DIR%\Maestro.bat"
echo echo. >> "%INSTALL_DIR%\Maestro.bat"
echo echo Press any key to exit... >> "%INSTALL_DIR%\Maestro.bat"
echo pause ^>nul >> "%INSTALL_DIR%\Maestro.bat"

:: Create configuration script
echo @echo off > "%INSTALL_DIR%\configure.bat"
echo title Maestro Configuration >> "%INSTALL_DIR%\configure.bat"
echo echo. >> "%INSTALL_DIR%\configure.bat"
echo echo ======================================== >> "%INSTALL_DIR%\configure.bat"
echo echo  Maestro Configuration Setup >> "%INSTALL_DIR%\configure.bat"
echo echo ======================================== >> "%INSTALL_DIR%\configure.bat"
echo echo. >> "%INSTALL_DIR%\configure.bat"
echo echo This will help you configure your Tuya credentials. >> "%INSTALL_DIR%\configure.bat"
echo echo. >> "%INSTALL_DIR%\configure.bat"
echo echo You need the following from Tuya IoT Platform: >> "%INSTALL_DIR%\configure.bat"
echo echo - Client ID (Access ID) >> "%INSTALL_DIR%\configure.bat"
echo echo - Client Secret (Access Secret) >> "%INSTALL_DIR%\configure.bat"
echo echo - User ID (from your Tuya app account) >> "%INSTALL_DIR%\configure.bat"
echo echo. >> "%INSTALL_DIR%\configure.bat"
echo echo Visit: https://iot.tuya.com/ >> "%INSTALL_DIR%\configure.bat"
echo echo. >> "%INSTALL_DIR%\configure.bat"
echo pause >> "%INSTALL_DIR%\configure.bat"
echo notepad "%INSTALL_DIR%\.env" >> "%INSTALL_DIR%\configure.bat"

:: Create shortcuts
echo [INFO] Creating shortcuts...

:: Create desktop shortcut using PowerShell
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP_SHORTCUT%'); $Shortcut.TargetPath = '%INSTALL_DIR%\Maestro.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Description = 'Maestro Energy Management System'; $Shortcut.Save()" >nul 2>&1

:: Create start menu shortcut
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTMENU_SHORTCUT%'); $Shortcut.TargetPath = '%INSTALL_DIR%\Maestro.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Description = 'Maestro Energy Management System'; $Shortcut.Save()" >nul 2>&1

echo [OK] Shortcuts created.
echo.

:: Installation complete
echo ========================================
echo  INSTALLATION COMPLETE!
echo ========================================
echo.
echo Maestro Energy Management has been installed to:
echo %INSTALL_DIR%
echo.
echo Desktop shortcut created: Maestro Energy Management
echo Start Menu shortcut created: Maestro Energy Management
echo.
echo NEXT STEPS:
echo.
echo 1. Configure your Tuya credentials:
echo    - Run "Configure Maestro" from Start Menu, or
echo    - Double-click: %INSTALL_DIR%\configure.bat
echo.
echo 2. Launch Maestro:
echo    - Double-click the desktop shortcut, or
echo    - Run from Start Menu: Maestro Energy Management
echo.
echo 3. The application will open in your browser at:
echo    http://localhost:3000
echo.
echo For help and documentation, see:
echo %INSTALL_DIR%\WINDOWS_SETUP_GUIDE.md
echo.
echo ========================================
echo.
echo Would you like to configure Tuya credentials now? (y/n)
set /p CONFIGURE_NOW="Enter choice: "
if /i "%CONFIGURE_NOW%"=="y" (
    echo.
    echo Opening configuration...
    call "%INSTALL_DIR%\configure.bat"
)
echo.
echo Would you like to start Maestro now? (y/n)
set /p START_NOW="Enter choice: "
if /i "%START_NOW%"=="y" (
    echo.
    echo Starting Maestro...
    call "%INSTALL_DIR%\Maestro.bat"
)
echo.
echo Installation complete. Press any key to exit.
pause >nul