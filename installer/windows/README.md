# 🪟 Maestro Energy Management - Windows Installer

> **One-click installation for Windows PC**

## 📦 What's Included

This installer package provides everything needed to run Maestro Energy Management on Windows:

- ✅ **Automated dependency checking** (Node.js 18+, Git)
- ✅ **Automatic pnpm installation** (package manager)
- ✅ **Repository cloning** from GitHub
- ✅ **Dependency installation** (all npm packages)
- ✅ **Environment setup** (configuration files)
- ✅ **Desktop & Start Menu shortcuts**
- ✅ **Launch scripts** for easy startup
- ✅ **Configuration helper** for Tuya credentials

## 🚀 Quick Installation

### Prerequisites
Before running the installer, ensure you have:
1. **Node.js 18+** - [Download from nodejs.org](https://nodejs.org/) (LTS version)
2. **Git** - [Download from git-scm.com](https://git-scm.com/download/win)

### Installation Steps

1. **Download installer files** to a folder (e.g., Desktop)
2. **Right-click `install.bat`** → **"Run as administrator"**
3. **Follow the on-screen prompts**
4. **Configure Tuya credentials** when prompted
5. **Launch Maestro** from desktop shortcut

### Installation Process
```
[1/7] Checking Node.js installation...
[2/7] Checking Git installation...
[3/7] Installing pnpm package manager...
[4/7] Creating installation directory...
[5/7] Downloading Maestro Energy Management...
[6/7] Installing dependencies (2-3 minutes)...
[7/7] Setting up configuration files...
```

## 📍 Installation Locations

**Main Installation:**
```
C:\Program Files\Maestro Energy Management\
```

**Shortcuts Created:**
- Desktop: `Maestro Energy Management.lnk`
- Start Menu: `Programs\Maestro Energy Management.lnk`

## 🎮 How to Use After Installation

### Method 1: Desktop Shortcut
1. Double-click "Maestro Energy Management" on desktop
2. Two command windows will open (backend + frontend)
3. Browser opens automatically to http://localhost:3000
4. Login with your Tuya account

### Method 2: Start Menu
1. Click Start → Search "Maestro"
2. Click "Maestro Energy Management"
3. Follow same process as above

### Method 3: Manual Launch
```cmd
# Navigate to installation directory
cd "C:\Program Files\Maestro Energy Management"

# Start both servers
Maestro.bat
```

## ⚙️ Configuration

### Tuya Credentials Setup
1. **Run configuration helper:**
   - Desktop: Double-click "Configure Maestro" (if created)
   - Or manually: `C:\Program Files\Maestro Energy Management\configure.bat`

2. **Edit .env file with your credentials:**
   ```env
   TUYA_CLIENT_ID=your_actual_client_id
   TUYA_CLIENT_SECRET=your_actual_client_secret
   TUYA_BASE_URL=https://openapi.tuyaeu.com
   TUYA_USER_ID=your_actual_user_id
   ```

3. **Get Tuya credentials from:**
   - Go to [Tuya IoT Platform](https://iot.tuya.com/)
   - Create/login to developer account
   - Create new project
   - Copy Client ID, Client Secret, and User ID

## 🛠️ Available Scripts

The installer creates several convenient scripts:

**Main Launcher:**
```cmd
C:\Program Files\Maestro Energy Management\Maestro.bat
```
- Starts both backend and frontend servers
- Opens browser automatically
- Shows server status

**Individual Servers:**
```cmd
# Backend only (Port 3001)
C:\Program Files\Maestro Energy Management\start-backend.bat

# Frontend only (Port 3000) 
C:\Program Files\Maestro Energy Management\start-frontend.bat
```

**Configuration:**
```cmd
# Open configuration file
C:\Program Files\Maestro Energy Management\configure.bat
```

## 🔧 Troubleshooting

### Common Issues

**1. "Not recognized as administrator"**
- Right-click `install.bat` → "Run as administrator"
- If still fails, open Command Prompt as admin and run manually

**2. "Node.js not found"**
- Install Node.js 18+ from nodejs.org
- Choose LTS version
- Ensure "Add to PATH" is checked during installation
- Restart Command Prompt

**3. "Git not found"**
- Install Git from git-scm.com
- Use default settings during installation
- Restart Command Prompt

**4. "Failed to download application"**
- Check internet connection
- Ensure firewall isn't blocking Git
- Try running installer again

**5. "Port already in use"**
- Close any existing Node.js applications
- Restart computer if necessary
- Use Task Manager to kill node.exe processes

**6. "Dependencies installation failed"**
- Check internet connection
- Clear npm cache: `npm cache clean --force`
- Try running installer again

### Manual Fixes

**Reset Installation:**
```cmd
# Remove installation directory
rmdir /s "C:\Program Files\Maestro Energy Management"

# Run installer again
install.bat
```

**Update Dependencies:**
```cmd
cd "C:\Program Files\Maestro Energy Management"
pnpm install
```

**Check Services:**
```cmd
# Check if servers are running
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

## 🗑️ Uninstallation

### Automatic Uninstall
1. Navigate to installation directory
2. Right-click `uninstall.bat` → "Run as administrator"
3. Follow prompts

### Manual Uninstall
1. Delete: `C:\Program Files\Maestro Energy Management\`
2. Delete desktop shortcut
3. Delete Start Menu shortcut
4. Optionally remove Node.js and Git if not needed

## 📋 System Requirements

**Minimum Requirements:**
- Windows 10 or Windows 11
- 4GB RAM
- 2GB free disk space
- Internet connection
- Administrator privileges

**Recommended:**
- Windows 11
- 8GB RAM
- 5GB free disk space
- Stable broadband connection

## 🆘 Support

**If you encounter issues:**

1. **Check the logs** in Command Prompt windows
2. **Verify Tuya credentials** are correct
3. **Restart the application**
4. **Check firewall settings**
5. **Run as administrator**

**For additional help:**
- Read: `WINDOWS_SETUP_GUIDE.md` in installation directory
- Check: GitHub repository issues
- Ensure all prerequisites are properly installed

## ✨ Features After Installation

Once installed and configured, you'll have access to:

- **🏠 Dashboard**: Overview of all your devices
- **🔌 Device Management**: Advanced device control interface
- **⚡ Energy Monitoring**: Real-time power consumption tracking
- **🔍 Device Discovery**: Import devices from your Tuya account
- **📊 Statistics**: Usage analytics and insights
- **⚙️ Settings**: Customizable preferences
- **📱 Responsive Design**: Works great in any browser window size

The installation provides a complete, professional IoT energy management system ready for use!