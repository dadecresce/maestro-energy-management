@echo off
setlocal enabledelayedexpansion

:: Maestro Energy Management System - Windows Uninstaller
:: Version 1.0.0

title Maestro Energy Management - Uninstaller

echo.
echo ========================================
echo  Maestro Energy Management System
echo  Uninstaller v1.0.0
echo ========================================
echo.

:: Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This uninstaller requires administrator privileges.
    echo Please run as administrator and try again.
    echo.
    pause
    exit /b 1
)

echo [INFO] Administrator privileges confirmed.
echo.

:: Set paths
set "INSTALL_DIR=%ProgramFiles%\Maestro Energy Management"
set "DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\Maestro Energy Management.lnk"
set "STARTMENU_SHORTCUT=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Maestro Energy Management.lnk"

:: Confirmation
echo This will completely remove Maestro Energy Management from your system.
echo.
echo The following will be removed:
echo - Installation directory: %INSTALL_DIR%
echo - Desktop shortcut
echo - Start Menu shortcut
echo.
echo WARNING: This will delete all local data and configuration!
echo.
set /p CONFIRM="Are you sure you want to uninstall? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo.
    echo Uninstallation cancelled.
    pause
    exit /b 0
)
echo.

:: Stop any running processes
echo [1/4] Stopping Maestro processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] Processes stopped.
echo.

:: Remove shortcuts
echo [2/4] Removing shortcuts...
if exist "%DESKTOP_SHORTCUT%" (
    del "%DESKTOP_SHORTCUT%" >nul 2>&1
    echo [OK] Desktop shortcut removed.
) else (
    echo [INFO] Desktop shortcut not found.
)

if exist "%STARTMENU_SHORTCUT%" (
    del "%STARTMENU_SHORTCUT%" >nul 2>&1
    echo [OK] Start Menu shortcut removed.
) else (
    echo [INFO] Start Menu shortcut not found.
)
echo.

:: Remove installation directory
echo [3/4] Removing installation directory...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [WARNING] Some files could not be removed. They may be in use.
        echo Please restart your computer and run this uninstaller again.
    ) else (
        echo [OK] Installation directory removed.
    )
) else (
    echo [INFO] Installation directory not found.
)
echo.

:: Optional: Remove pnpm (global)
echo [4/4] Cleanup options...
echo.
set /p REMOVE_PNPM="Would you like to remove pnpm (global package manager)? (y/n): "
if /i "%REMOVE_PNPM%"=="y" (
    npm uninstall -g pnpm >nul 2>&1
    echo [OK] pnpm removed.
)
echo.

:: Completion
echo ========================================
echo  UNINSTALLATION COMPLETE!
echo ========================================
echo.
echo Maestro Energy Management has been removed from your system.
echo.
echo NOTE: Node.js and Git were not removed as they may be used
echo by other applications. You can remove them manually if needed:
echo.
echo - Node.js: Control Panel ^> Programs ^> Uninstall a program
echo - Git: Control Panel ^> Programs ^> Uninstall a program
echo.
echo Thank you for using Maestro Energy Management!
echo.
echo Press any key to exit.
pause >nul