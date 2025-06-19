# Maestro Energy Management System - PowerShell Installer
# Version 1.0.0

param(
    [Parameter(Mandatory=$false)]
    [string]$InstallPath = "${env:ProgramFiles}\Maestro Energy Management",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipShortcuts,
    
    [Parameter(Mandatory=$false)]
    [switch]$Quiet
)

# Set execution policy for current session
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# Function to write colored output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White",
        [string]$Prefix = ""
    )
    
    if (-not $Quiet) {
        if ($Prefix) {
            Write-Host "[$Prefix] " -ForegroundColor Yellow -NoNewline
        }
        Write-Host $Message -ForegroundColor $Color
    }
}

# Function to check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Function to test if a command exists
function Test-Command {
    param([string]$Command)
    
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

# Main installer function
function Install-Maestro {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " Maestro Energy Management System" -ForegroundColor Cyan
    Write-Host " PowerShell Installer v1.0.0" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Check administrator privileges
    if (-not (Test-Administrator)) {
        Write-ColorOutput "This installer requires administrator privileges." "Red" "ERROR"
        Write-ColorOutput "Please run PowerShell as administrator and try again." "Red"
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-ColorOutput "Administrator privileges confirmed." "Green" "INFO"
    Write-Host ""

    Write-ColorOutput "Installation directory: $InstallPath" "Cyan" "INFO"
    Write-Host ""

    try {
        # Step 1: Check Node.js
        Write-ColorOutput "Checking Node.js installation..." "Yellow" "1/7"
        
        if (-not (Test-Command "node")) {
            Write-ColorOutput "Node.js is not installed or not in PATH." "Red" "ERROR"
            Write-Host ""
            Write-ColorOutput "Please install Node.js 18+ from https://nodejs.org/" "Yellow"
            Write-ColorOutput "Choose the LTS version and ensure 'Add to PATH' is checked." "Yellow"
            Write-Host ""
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        $nodeVersion = node --version
        Write-ColorOutput "Node.js found: $nodeVersion" "Green" "OK"
        Write-Host ""

        # Step 2: Check Git
        Write-ColorOutput "Checking Git installation..." "Yellow" "2/7"
        
        if (-not (Test-Command "git")) {
            Write-ColorOutput "Git is not installed or not in PATH." "Red" "ERROR"
            Write-Host ""
            Write-ColorOutput "Please install Git from https://git-scm.com/download/win" "Yellow"
            Write-ColorOutput "Use default settings during installation." "Yellow"
            Write-Host ""
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        $gitVersion = git --version
        Write-ColorOutput "Git found: $gitVersion" "Green" "OK"
        Write-Host ""

        # Step 3: Install pnpm
        Write-ColorOutput "Installing pnpm package manager..." "Yellow" "3/7"
        
        $pnpmResult = npm install -g pnpm 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "Failed to install pnpm." "Red" "ERROR"
            Write-ColorOutput $pnpmResult "Red"
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        Write-ColorOutput "pnpm installed successfully." "Green" "OK"
        Write-Host ""

        # Step 4: Create installation directory
        Write-ColorOutput "Creating installation directory..." "Yellow" "4/7"
        
        if (Test-Path $InstallPath) {
            Write-ColorOutput "Removing existing installation..." "Yellow" "INFO"
            Remove-Item -Path $InstallPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
        Write-ColorOutput "Installation directory created." "Green" "OK"
        Write-Host ""

        # Step 5: Clone repository
        Write-ColorOutput "Downloading Maestro Energy Management..." "Yellow" "5/7"
        
        Set-Location $InstallPath
        $cloneResult = git clone https://github.com/dadecresce/maestro-energy-management.git . 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "Failed to download the application." "Red" "ERROR"
            Write-ColorOutput "Please check your internet connection." "Yellow"
            Write-ColorOutput $cloneResult "Red"
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        Write-ColorOutput "Application downloaded successfully." "Green" "OK"
        Write-Host ""

        # Step 6: Install dependencies
        Write-ColorOutput "Installing dependencies (this may take 2-3 minutes)..." "Yellow" "6/7"
        
        $installResult = pnpm install 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "Failed to install dependencies." "Red" "ERROR"
            Write-ColorOutput $installResult "Red"
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        Write-ColorOutput "Dependencies installed successfully." "Green" "OK"
        Write-Host ""

        # Step 7: Setup configuration
        Write-ColorOutput "Setting up configuration files..." "Yellow" "7/7"
        
        Copy-Item ".env.example" ".env" -Force
        Copy-Item "apps\backend\.env.example" "apps\backend\.env" -Force
        Copy-Item "apps\frontend\.env.example" "apps\frontend\.env" -Force
        
        Write-ColorOutput "Configuration files created." "Green" "OK"
        Write-Host ""

        # Create launcher scripts
        Write-ColorOutput "Creating launcher scripts..." "Yellow" "INFO"
        
        # Backend launcher
        $backendLauncher = @'
@echo off
title Maestro Backend Server
cd /d "%~dp0\apps\backend"
echo Starting Maestro Backend Server...
echo Backend will be available at http://localhost:3001
echo.
npm run dev:simple
'@
        $backendLauncher | Out-File -FilePath "$InstallPath\start-backend.bat" -Encoding ASCII

        # Frontend launcher
        $frontendLauncher = @'
@echo off
title Maestro Frontend Server
cd /d "%~dp0\apps\frontend"
echo Starting Maestro Frontend Server...
echo Frontend will be available at http://localhost:3000
echo.
npm run dev
'@
        $frontendLauncher | Out-File -FilePath "$InstallPath\start-frontend.bat" -Encoding ASCII

        # Main launcher
        $mainLauncher = @'
@echo off
title Maestro Energy Management System
echo.
echo ========================================
echo  Maestro Energy Management System
echo ========================================
echo.
echo [INFO] Starting Maestro servers...
echo.
echo [1] Starting Backend Server (Port 3001)...
start "Maestro Backend" "%~dp0\start-backend.bat"
timeout /t 5 /nobreak >nul

echo [2] Starting Frontend Server (Port 3000)...
start "Maestro Frontend" "%~dp0\start-frontend.bat"
timeout /t 3 /nobreak >nul

echo [3] Opening Maestro in your default browser...
timeout /t 8 /nobreak >nul
start http://localhost:3000

echo.
echo ========================================
echo  Maestro is now running!
echo  Frontend: http://localhost:3000
echo  Backend:  http://localhost:3001
echo ========================================
echo.
echo Press any key to exit...
pause >nul
'@
        $mainLauncher | Out-File -FilePath "$InstallPath\Maestro.bat" -Encoding ASCII

        # Configuration script
        $configScript = @'
@echo off
title Maestro Configuration
echo.
echo ========================================
echo  Maestro Configuration Setup
echo ========================================
echo.
echo This will help you configure your Tuya credentials.
echo.
echo You need the following from Tuya IoT Platform:
echo - Client ID (Access ID)
echo - Client Secret (Access Secret)
echo - User ID (from your Tuya app account)
echo.
echo Visit: https://iot.tuya.com/
echo.
pause
notepad "%~dp0\.env"
'@
        $configScript | Out-File -FilePath "$InstallPath\configure.bat" -Encoding ASCII

        Write-ColorOutput "Launcher scripts created." "Green" "OK"
        Write-Host ""

        # Create shortcuts
        if (-not $SkipShortcuts) {
            Write-ColorOutput "Creating shortcuts..." "Yellow" "INFO"
            
            # Desktop shortcut
            $desktopPath = [Environment]::GetFolderPath("Desktop")
            $shortcutPath = "$desktopPath\Maestro Energy Management.lnk"
            
            $WshShell = New-Object -comObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut($shortcutPath)
            $Shortcut.TargetPath = "$InstallPath\Maestro.bat"
            $Shortcut.WorkingDirectory = $InstallPath
            $Shortcut.Description = "Maestro Energy Management System"
            $Shortcut.Save()

            # Start Menu shortcut
            $startMenuPath = [Environment]::GetFolderPath("CommonPrograms")
            $startShortcutPath = "$startMenuPath\Maestro Energy Management.lnk"
            
            $StartShortcut = $WshShell.CreateShortcut($startShortcutPath)
            $StartShortcut.TargetPath = "$InstallPath\Maestro.bat"
            $StartShortcut.WorkingDirectory = $InstallPath
            $StartShortcut.Description = "Maestro Energy Management System"
            $StartShortcut.Save()

            Write-ColorOutput "Shortcuts created." "Green" "OK"
            Write-Host ""
        }

        # Installation complete
        Write-Host "========================================" -ForegroundColor Green
        Write-Host " INSTALLATION COMPLETE!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-ColorOutput "Maestro Energy Management has been installed to:" "Cyan"
        Write-ColorOutput $InstallPath "White"
        Write-Host ""
        
        if (-not $SkipShortcuts) {
            Write-ColorOutput "Desktop shortcut created: Maestro Energy Management" "Cyan"
            Write-ColorOutput "Start Menu shortcut created: Maestro Energy Management" "Cyan"
            Write-Host ""
        }
        
        Write-ColorOutput "NEXT STEPS:" "Yellow"
        Write-Host ""
        Write-ColorOutput "1. Configure your Tuya credentials:" "White"
        Write-ColorOutput "   - Run: $InstallPath\configure.bat" "Gray"
        Write-Host ""
        Write-ColorOutput "2. Launch Maestro:" "White"
        Write-ColorOutput "   - Double-click the desktop shortcut, or" "Gray"
        Write-ColorOutput "   - Run: $InstallPath\Maestro.bat" "Gray"
        Write-Host ""
        Write-ColorOutput "3. The application will open in your browser at:" "White"
        Write-ColorOutput "   http://localhost:3000" "Cyan"
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""

        # Offer to configure and start
        if (-not $Quiet) {
            $configureNow = Read-Host "Would you like to configure Tuya credentials now? (y/n)"
            if ($configureNow -eq 'y' -or $configureNow -eq 'Y') {
                Write-Host ""
                Write-ColorOutput "Opening configuration..." "Yellow"
                Start-Process notepad -ArgumentList "$InstallPath\.env" -Wait
            }

            Write-Host ""
            $startNow = Read-Host "Would you like to start Maestro now? (y/n)"
            if ($startNow -eq 'y' -or $startNow -eq 'Y') {
                Write-Host ""
                Write-ColorOutput "Starting Maestro..." "Yellow"
                Start-Process "$InstallPath\Maestro.bat"
            }
        }

        Write-Host ""
        Write-ColorOutput "Installation complete!" "Green"
        
    }
    catch {
        Write-ColorOutput "Installation failed: $($_.Exception.Message)" "Red" "ERROR"
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Run the installer
Install-Maestro

if (-not $Quiet) {
    Write-Host ""
    Read-Host "Press Enter to exit"
}