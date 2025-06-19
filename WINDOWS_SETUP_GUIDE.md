# 🪟 Windows Setup Guide - Maestro Energy Management System

> **Complete setup instructions for testing Maestro on Windows PC**

## 📋 Prerequisites

### Required Software
1. **Node.js 18+** - [Download from nodejs.org](https://nodejs.org/en/download/)
   - Choose "LTS" version
   - During installation, check "Add to PATH" option

2. **Git** - [Download from git-scm.com](https://git-scm.com/download/win)
   - Use default settings during installation

3. **pnpm** (Package Manager) - Install after Node.js:
   ```cmd
   npm install -g pnpm
   ```

### Optional but Recommended
- **Visual Studio Code** - [Download here](https://code.visualstudio.com/)
- **Windows Terminal** - [Get from Microsoft Store](https://aka.ms/terminal)

## 🚀 Quick Setup (5 minutes)

### Step 1: Clone Repository
Open Command Prompt or PowerShell and run:
```cmd
git clone https://github.com/dadecresce/maestro-energy-management.git
cd maestro-energy-management
```

### Step 2: Install Dependencies
```cmd
pnpm install
```
*This may take 2-3 minutes*

### Step 3: Environment Setup
1. Copy environment files:
   ```cmd
   copy .env.example .env
   copy apps\backend\.env.example apps\backend\.env
   copy apps\frontend\.env.example apps\frontend\.env
   ```

2. **IMPORTANT**: Edit `.env` file with Tuya credentials:
   ```
   # Tuya Cloud API Configuration
   TUYA_CLIENT_ID=your_tuya_client_id_here
   TUYA_CLIENT_SECRET=your_tuya_client_secret_here
   TUYA_BASE_URL=https://openapi.tuyaeu.com
   TUYA_USER_ID=your_tuya_user_id_here
   ```

### Step 4: Start Development Servers
Open **TWO separate** Command Prompt windows:

**Window 1 - Backend Server:**
```cmd
cd maestro-energy-management
cd apps\backend
npm run dev:simple
```
*Should start on http://localhost:3001*

**Window 2 - Frontend Server:**
```cmd
cd maestro-energy-management
cd apps\frontend
npm run dev
```
*Should start on http://localhost:3000*

### Step 5: Test the Application
1. Open browser to **http://localhost:3000**
2. Click "Login with Tuya" 
3. You should see the dashboard
4. Go to **Devices** page to see the new interface
5. Try device discovery and control

## 🔧 Tuya Credentials Setup

### Getting Tuya Developer Credentials
1. Go to [Tuya IoT Platform](https://iot.tuya.com/)
2. Create developer account or login
3. Create a new project
4. Go to project settings to get:
   - `Client ID` (Access ID)
   - `Client Secret` (Access Secret)
   - `User ID` (from your Tuya app account)

### Environment File Configuration
Edit the `.env` file in the root directory:
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

## 🎯 What to Test

### Core Features to Verify
✅ **Authentication Flow**
- Login with Tuya works
- Redirects to dashboard after login

✅ **Dashboard Page** 
- Shows device statistics cards
- Device grid displays properly
- Energy monitoring data visible
- Refresh and discovery buttons work

✅ **NEW: Devices Page** 
- **Search and Filter**: Try searching device names
- **View Modes**: Toggle between grid/list view
- **Device Control**: Toggle devices on/off
- **Bulk Actions**: Select multiple devices
- **Statistics**: View online/active device counts
- **Sorting**: Sort by name, status, type, etc.

✅ **Device Discovery**
- Discover devices from Tuya account
- Import selected devices
- See real device data

✅ **Real-time Control**
- Device toggles work instantly
- Energy monitoring updates
- Status changes reflect immediately

## 🐛 Troubleshooting

### Common Issues on Windows

**1. "pnpm: command not found"**
```cmd
npm install -g pnpm
# Restart Command Prompt
```

**2. "Port already in use"**
```cmd
# Kill processes on ports 3000/3001
netstat -ano | findstr :3000
netstat -ano | findstr :3001
taskkill /F /PID <process_id>
```

**3. "Failed to authenticate with Tuya API"**
- Double-check Tuya credentials in `.env` file
- Ensure no extra spaces in credential values
- Verify Tuya project is active and configured

**4. "No devices found"**
- Make sure devices are linked to your Tuya account
- Check if `TUYA_USER_ID` is correctly set
- Try the device discovery page

**5. Backend won't start**
```cmd
# Clear cache and reinstall
rmdir /s node_modules
pnpm install
```

### Performance Tips
- Use Windows Terminal instead of Command Prompt
- Close unnecessary applications
- Ensure stable internet connection for Tuya API calls

## 📱 Features to Showcase

### Highlight These New Capabilities
1. **Advanced Device Management**: Search, filter, sort devices
2. **Bulk Operations**: Control multiple devices at once  
3. **Real-time Monitoring**: Live energy consumption data
4. **Professional UI**: Material Design with responsive layout
5. **Dual View Modes**: Grid and list views for different preferences
6. **Smart Statistics**: Device counts, power usage, online status
7. **Quick Discovery**: Easy device import from Tuya account

## 🔄 Development Workflow

### Making Changes
```cmd
# Pull latest changes
git pull origin develop

# Install any new dependencies
pnpm install

# Restart servers if needed
```

### Testing Different Features
- **Dashboard**: Overview and statistics
- **Devices**: Full device management (NEW!)
- **Discovery**: Import new devices
- **Control**: Real-time device operations

## 📞 Support

If your friend encounters issues:
1. Check Windows firewall settings
2. Ensure antivirus isn't blocking Node.js
3. Try running Command Prompt as Administrator
4. Share error messages for troubleshooting

## ✨ What's New in This Version

🎉 **Major Update: Complete Devices Page**
- Professional device management interface
- Advanced filtering and search capabilities
- Bulk device operations
- Real-time energy monitoring
- Responsive grid/list views
- Device statistics dashboard

The system now provides a complete device management experience comparable to professional IoT platforms!