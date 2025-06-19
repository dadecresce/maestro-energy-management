# 🪟 Maestro Energy Management - Windows Installer Guide

> **Complete guide for using the Windows installer package**

## 📦 Installer Package Contents

This installer package provides multiple installation methods for Windows:

```
MaestroInstaller/
├── install.bat                    # Batch installer (recommended)
├── install.ps1                    # PowerShell installer (advanced)
├── uninstall.bat                  # Uninstaller
├── create-installer-package.bat   # Package creator
├── README.md                      # Detailed documentation
├── INSTALLER_GUIDE.md             # This file
├── WINDOWS_SETUP_GUIDE.md         # Setup guide
├── QUICK_START.txt                # Quick start instructions
└── VERSION.txt                    # Version information
```

## 🚀 Installation Methods

### Method 1: Batch Installer (Recommended)
**Best for: Most users, simple installation**

1. **Download and extract** the installer package
2. **Right-click `install.bat`** → **"Run as administrator"**
3. **Follow the wizard prompts**
4. **Configure Tuya credentials** when prompted
5. **Launch from desktop shortcut**

**Features:**
- ✅ Guided installation with progress indicators
- ✅ Automatic dependency checking
- ✅ Desktop and Start Menu shortcuts
- ✅ Interactive configuration setup
- ✅ Option to start immediately after install

### Method 2: PowerShell Installer (Advanced)
**Best for: Power users, automation, custom installations**

1. **Open PowerShell as Administrator**
2. **Navigate to installer directory**
3. **Run installation:**
   ```powershell
   # Basic installation
   .\install.ps1
   
   # Custom installation path
   .\install.ps1 -InstallPath "D:\MyApps\Maestro"
   
   # Silent installation (no prompts)
   .\install.ps1 -Quiet
   
   # Skip creating shortcuts
   .\install.ps1 -SkipShortcuts
   ```

**Advanced Options:**
- `-InstallPath`: Custom installation directory
- `-SkipShortcuts`: Don't create desktop/start menu shortcuts
- `-Quiet`: Silent installation with minimal output

## 📋 Prerequisites

Before running any installer, ensure you have:

### Required Software
1. **Windows 10 or Windows 11**
2. **Node.js 18+** - [Download from nodejs.org](https://nodejs.org/)
   - Choose "LTS" (Long Term Support) version
   - During installation, check "Add to PATH" option
3. **Git** - [Download from git-scm.com](https://git-scm.com/download/win)
   - Use default settings during installation

### System Requirements
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space minimum, 5GB recommended
- **Network**: Stable internet connection for downloading dependencies
- **Permissions**: Administrator privileges required

### Verification Commands
After installing prerequisites, verify in Command Prompt:
```cmd
node --version    # Should show v18.x.x or higher
npm --version     # Should show 8.x.x or higher
git --version     # Should show git version 2.x.x
```

## 🔧 Installation Process

### Step-by-Step Process
Both installers follow the same 7-step process:

```
[1/7] Checking Node.js installation...
[2/7] Checking Git installation...
[3/7] Installing pnpm package manager...
[4/7] Creating installation directory...
[5/7] Downloading Maestro Energy Management...
[6/7] Installing dependencies (2-3 minutes)...
[7/7] Setting up configuration files...
```

### What Gets Installed
The installer will:
- ✅ Install pnpm package manager globally
- ✅ Clone the Maestro repository from GitHub
- ✅ Install all Node.js dependencies (~200MB)
- ✅ Create configuration files
- ✅ Set up launcher scripts
- ✅ Create desktop and Start Menu shortcuts
- ✅ Prepare the application for first run

### Installation Locations
**Default Installation Directory:**
```
C:\Program Files\Maestro Energy Management\
├── apps/                           # Frontend and backend applications
├── packages/                       # Shared packages
├── installer/                      # Installer files
├── .env                           # Configuration file
├── Maestro.bat                    # Main launcher
├── start-backend.bat              # Backend launcher
├── start-frontend.bat             # Frontend launcher
├── configure.bat                  # Configuration helper
└── [other project files]
```

**Shortcuts Created:**
- Desktop: `Maestro Energy Management.lnk`
- Start Menu: `Programs\Maestro Energy Management.lnk`

## ⚙️ Configuration

### Tuya Credentials Setup
After installation, you need to configure your Tuya developer credentials:

1. **Get Tuya Developer Account:**
   - Go to [Tuya IoT Platform](https://iot.tuya.com/)
   - Create account or sign in
   - Create a new project
   - Get your credentials:
     - Client ID (Access ID)
     - Client Secret (Access Secret)
     - User ID (from your Tuya mobile app account)

2. **Configure Credentials:**
   - **Option A**: Run configuration helper
     ```cmd
     C:\Program Files\Maestro Energy Management\configure.bat
     ```
   - **Option B**: Edit manually
     ```cmd
     notepad "C:\Program Files\Maestro Energy Management\.env"
     ```

3. **Edit Configuration File:**
   ```env
   # Required Tuya Configuration
   TUYA_CLIENT_ID=your_actual_client_id
   TUYA_CLIENT_SECRET=your_actual_client_secret
   TUYA_BASE_URL=https://openapi.tuyaeu.com
   TUYA_USER_ID=your_actual_user_id
   
   # Optional Configuration
   NODE_ENV=development
   PORT=3001
   ```

### Advanced Configuration
For advanced users, additional configuration options are available in:
- `apps/backend/.env` - Backend-specific settings
- `apps/frontend/.env` - Frontend-specific settings

## 🎮 Using Maestro After Installation

### Starting the Application

**Method 1: Desktop Shortcut**
- Double-click "Maestro Energy Management" on desktop
- Two command windows will open (backend + frontend servers)
- Browser opens automatically to http://localhost:3000

**Method 2: Start Menu**
- Windows key → Search "Maestro"
- Click "Maestro Energy Management"

**Method 3: Manual Launch**
```cmd
cd "C:\Program Files\Maestro Energy Management"
Maestro.bat
```

### Application URLs
Once running:
- **Frontend (User Interface)**: http://localhost:3000
- **Backend (API Server)**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### Stopping the Application
- Close both command prompt windows
- Or press `Ctrl+C` in each window to stop servers

## 🛠️ Troubleshooting

### Common Installation Issues

**1. "Access Denied" or "Permission Error"**
```
Solution: Run installer as administrator
- Right-click install.bat → "Run as administrator"
- Or open Command Prompt as admin first
```

**2. "Node.js not found" or "Git not found"**
```
Solution: Install missing prerequisites
- Download Node.js from nodejs.org (LTS version)
- Download Git from git-scm.com
- Restart Command Prompt after installation
- Verify: node --version && git --version
```

**3. "Failed to download application"**
```
Solution: Check network connectivity
- Ensure internet connection is stable
- Check if firewall is blocking Git
- Try disabling antivirus temporarily
- Use corporate network? Check proxy settings
```

**4. "Dependencies installation failed"**
```
Solution: Network or npm issues
- Check internet connection
- Clear npm cache: npm cache clean --force
- Try running installer again
- Check disk space (need ~2GB free)
```

**5. "Port already in use" when starting**
```
Solution: Free up ports 3000 and 3001
- Close any existing Node.js applications
- Kill processes: taskkill /f /im node.exe
- Restart computer if necessary
- Check: netstat -ano | findstr :3000
```

**6. "Application won't start"**
```
Solution: Configuration or dependency issues
- Verify Tuya credentials in .env file
- Try reinstalling: run uninstall.bat then install.bat
- Check Windows Event Viewer for errors
- Ensure all prerequisites are correctly installed
```

### Advanced Troubleshooting

**Manual Dependency Installation:**
```cmd
cd "C:\Program Files\Maestro Energy Management"
pnpm install --force
```

**Reset Configuration:**
```cmd
cd "C:\Program Files\Maestro Energy Management"
copy .env.example .env
copy apps\backend\.env.example apps\backend\.env
copy apps\frontend\.env.example apps\frontend\.env
```

**Check Installation Integrity:**
```cmd
cd "C:\Program Files\Maestro Energy Management"
git status
pnpm list
```

**Update to Latest Version:**
```cmd
cd "C:\Program Files\Maestro Energy Management"
git pull origin main
pnpm install
```

## 🗑️ Uninstallation

### Automatic Uninstall
1. **Run uninstaller as administrator:**
   ```cmd
   # Navigate to installation directory
   cd "C:\Program Files\Maestro Energy Management"
   
   # Run uninstaller
   uninstall.bat
   ```

2. **Follow the prompts** to confirm uninstallation

### Manual Uninstall
If automatic uninstall fails:
1. **Stop all Maestro processes:**
   ```cmd
   taskkill /f /im node.exe
   ```

2. **Remove installation directory:**
   ```cmd
   rmdir /s "C:\Program Files\Maestro Energy Management"
   ```

3. **Remove shortcuts:**
   - Delete desktop shortcut
   - Delete Start Menu shortcut

4. **Optional: Remove global packages:**
   ```cmd
   npm uninstall -g pnpm
   ```

### What's NOT Removed
The uninstaller preserves:
- Node.js installation
- Git installation
- Other global npm packages

These can be removed manually if no longer needed.

## 🔄 Updates and Maintenance

### Updating Maestro
To update to the latest version:
```cmd
cd "C:\Program Files\Maestro Energy Management"
git pull origin main
pnpm install
```

### Backing Up Configuration
Before updates, backup your configuration:
```cmd
copy "C:\Program Files\Maestro Energy Management\.env" "%USERPROFILE%\Desktop\maestro-config-backup.env"
```

### Checking for Updates
Visit the GitHub repository for latest releases:
https://github.com/dadecresce/maestro-energy-management

## 📞 Support and Help

### Getting Help
If you encounter issues:

1. **Check the logs** in the command prompt windows
2. **Verify prerequisites** are correctly installed
3. **Try reinstalling** using the uninstaller first
4. **Check firewall and antivirus** settings
5. **Read documentation** files included with installer

### Documentation Files
- `README.md` - Detailed installer documentation
- `WINDOWS_SETUP_GUIDE.md` - Complete Windows setup guide
- `QUICK_START.txt` - Quick reference instructions

### Online Resources
- **GitHub Repository**: https://github.com/dadecresce/maestro-energy-management
- **Tuya IoT Platform**: https://iot.tuya.com/
- **Node.js Download**: https://nodejs.org/
- **Git Download**: https://git-scm.com/

### System Information
When seeking support, provide:
- Windows version (Win+R → winver)
- Node.js version (node --version)
- Git version (git --version)
- Error messages from command prompt
- Steps that led to the issue

## ✨ Post-Installation Features

Once successfully installed and configured, Maestro provides:

### Core Features
- 🏠 **Dashboard**: Real-time overview of all devices
- 🔌 **Device Management**: Professional device control interface
- ⚡ **Energy Monitoring**: Live power consumption tracking
- 🔍 **Device Discovery**: Import devices from Tuya account
- 📊 **Analytics**: Usage statistics and insights
- ⚙️ **Settings**: Customizable user preferences

### Advanced Capabilities
- 📱 **Responsive Design**: Works in any browser window size
- 🔄 **Real-time Updates**: Live device status synchronization
- 🎛️ **Bulk Controls**: Manage multiple devices simultaneously
- 📈 **Energy Charts**: Visualize consumption patterns
- 🏷️ **Device Organization**: Group devices by room or type

The installer provides everything needed for a complete, professional IoT energy management experience!