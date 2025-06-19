#!/usr/bin/env node

/**
 * Simple server for testing frontend connectivity
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables FIRST
import path from 'path';
const envPath = path.resolve(__dirname, '../../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Debug environment variables BEFORE importing services
console.log('Environment variables loaded:');
console.log('TUYA_CLIENT_ID:', process.env.TUYA_CLIENT_ID ? 'Set' : 'Not set');
console.log('TUYA_CLIENT_SECRET:', process.env.TUYA_CLIENT_SECRET ? 'Set' : 'Not set');
console.log('TUYA_BASE_URL:', process.env.TUYA_BASE_URL || 'Not set');

// Import Tuya service AFTER env variables are loaded  
import { tuyaApiService } from './services/tuya-api';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Basic routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running', timestamp: new Date().toISOString() });
});

// Mock user data
const mockUser = {
  _id: '123456789',
  email: 'demo@maestro.energy',
  displayName: 'Demo User',
  role: 'user',
  profile: {
    timezone: 'UTC',
    language: 'en'
  }
};

// Auth routes (mock implementation)
app.get('/api/auth/tuya/login', (req, res) => {
  console.log('Tuya login endpoint called');
  console.log('Query params:', req.query);
  
  const { countryCode } = req.query;
  console.log('Country code:', countryCode);
  
  // For mock purposes, redirect to callback with fake code
  const mockCallbackUrl = `http://localhost:3000/auth/tuya/callback?code=mock-auth-code-123&state=mock-state`;
  
  console.log('Returning auth URL:', mockCallbackUrl);
  
  res.json({
    success: true,
    data: {
      authUrl: mockCallbackUrl
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/tuya/callback', (req, res) => {
  const { code } = req.body;
  
  if (code === 'mock-auth-code-123') {
    res.json({
      success: true,
      data: {
        user: mockUser,
        tokens: {
          accessToken: 'mock-access-token-' + Date.now(),
          refreshToken: 'mock-refresh-token-' + Date.now(),
          expiresIn: 3600,
          uid: mockUser._id
        }
      },
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid authorization code',
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/auth/me', (req, res) => {
  // Check for mock auth header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer mock-access-token-')) {
    res.json({
      success: true,
      data: mockUser,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated',
      timestamp: new Date().toISOString()
    });
  }
});

// In-memory device storage for development
let importedDevices = [
  {
    _id: 'device-1',
    deviceId: 'mock-device-001',
    name: 'Living Room Plug',
    deviceType: 'smart_plug',
    isOnline: true,
    capabilities: [
      { type: 'switch', properties: { value: true }, commands: ['on', 'off'] },
      { type: 'power_monitoring', properties: {}, commands: [] }
    ],
    specifications: {
      manufacturer: 'Tuya',
      model: 'Smart Plug Pro',
      maxPower: 3000
    },
    status: {
      switch: true,
      online: true,
      energy: {
        activePower: 250,
        voltage: 220,
        current: 1.14
      }
    }
  },
  {
    _id: 'device-2', 
    deviceId: 'mock-device-002',
    name: 'Bedroom Plug',
    deviceType: 'smart_plug',
    isOnline: true,
    capabilities: [
      { type: 'switch', properties: { value: false }, commands: ['on', 'off'] },
      { type: 'power_monitoring', properties: {}, commands: [] }
    ],
    specifications: {
      manufacturer: 'Tuya',
      model: 'Smart Plug Mini',
      maxPower: 2000
    },
    status: {
      switch: false,
      online: true,
      energy: {
        activePower: 0,
        voltage: 220,
        current: 0
      }
    }
  }
];

// Mock device endpoints
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: importedDevices,
    pagination: {
      page: 1,
      limit: 20,
      total: importedDevices.length,
      totalPages: Math.ceil(importedDevices.length / 20)
    },
    timestamp: new Date().toISOString()
  });
});

// Device discovery endpoints
app.post('/api/devices/discover', async (req, res) => {
  console.log('Device discovery requested - Using REAL Tuya API');
  
  try {
    // REAL TUYA API CODE
    // First ensure we have a valid token
    const hasToken = await tuyaApiService.getAccessToken();
    if (!hasToken) {
      return res.json({
        success: false,
        data: [],
        message: 'Failed to authenticate with Tuya API. Check your credentials.',
        timestamp: new Date().toISOString()
      });
    }

    // Get devices from Tuya API
    const tuyaDevices = await tuyaApiService.discoverDevices();
    
    if (tuyaDevices.length === 0) {
      console.log('No devices found via standard discovery...');
      
      // Try with configured user ID or query param
      const userId = process.env.TUYA_USER_ID || req.query.userId as string;
      if (userId) {
        console.log(`Trying with user ID: ${userId}`);
        const userDevices = await tuyaApiService.getUserDevices(userId);
        if (userDevices.length > 0) {
          const discoveredDevices = await Promise.all(
            userDevices.map(async (tuyaDevice) => {
              try {
                const status = await tuyaApiService.getDeviceStatus(tuyaDevice.id);
                if (status.length > 0) {
                  tuyaDevice.status = status;
                }
              } catch (e) {
                console.log(`Failed to get status for device ${tuyaDevice.id}`);
              }
              return tuyaApiService.convertTuyaDevice(tuyaDevice);
            })
          );
          
          return res.json({
            success: true,
            data: { discovered: discoveredDevices },
            timestamp: new Date().toISOString()
          });
        }
      }
      
      return res.json({
        success: true,
        data: { discovered: [] },
        message: 'No devices found. Make sure you have: 1) Linked your Tuya app in IoT Platform, 2) Have devices in your account',
        tip: 'You can also try adding ?userId=YOUR_USER_ID to the URL if you know it',
        timestamp: new Date().toISOString()
      });
    }

    // Convert Tuya devices to our format
    const discoveredDevices = await Promise.all(
      tuyaDevices.map(async (tuyaDevice) => {
        try {
          // Get device status
          const status = await tuyaApiService.getDeviceStatus(tuyaDevice.id);
          if (status.length > 0) {
            tuyaDevice.status = status;
          }
        } catch (e) {
          console.log(`Failed to get status for device ${tuyaDevice.id}`);
        }
        return tuyaApiService.convertTuyaDevice(tuyaDevice);
      })
    );

    console.log(`Found ${discoveredDevices.length} real Tuya devices!`);
    
    res.json({
      success: true,
      data: { discovered: discoveredDevices },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Discovery error:', error);
    
    res.json({
      success: false,
      data: { discovered: [] },
      message: 'Failed to discover devices. Check your Tuya credentials and device linking.',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/devices/import', async (req, res) => {
  console.log('Device import requested');
  console.log('Device IDs to import:', req.body.deviceIds);
  
  const { deviceIds } = req.body;
  
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid device IDs provided',
      timestamp: new Date().toISOString()
    });
  }

  try {
    // Get real discovered devices from Tuya API (same logic as discovery endpoint)
    const hasToken = await tuyaApiService.getAccessToken();
    if (!hasToken) {
      return res.status(500).json({
        success: false,
        message: 'Failed to authenticate with Tuya API for import',
        timestamp: new Date().toISOString()
      });
    }

    // Get devices from Tuya API
    let tuyaDevices = await tuyaApiService.discoverDevices();
    
    // If no devices found through standard discovery, try with configured user ID
    if (tuyaDevices.length === 0) {
      const userId = process.env.TUYA_USER_ID;
      if (userId) {
        console.log(`Trying with user ID for import: ${userId}`);
        const userDevices = await tuyaApiService.getUserDevices(userId);
        tuyaDevices = userDevices;
      }
    }

    // Convert Tuya devices to our format with status
    const discoveredDevices = await Promise.all(
      tuyaDevices.map(async (tuyaDevice) => {
        try {
          // Get device status
          const status = await tuyaApiService.getDeviceStatus(tuyaDevice.id);
          if (status.length > 0) {
            tuyaDevice.status = status;
          }
        } catch (e) {
          console.log(`Failed to get status for device ${tuyaDevice.id} during import`);
        }
        return tuyaApiService.convertTuyaDevice(tuyaDevice);
      })
    );

    console.log(`Found ${discoveredDevices.length} real devices available for import`);

  // Find devices to import and convert to stored format
  let imported = 0;
  const skipped = [];
  const errors = [];

  for (const deviceId of deviceIds) {
    // Check if already imported
    const existingDevice = importedDevices.find(d => d.deviceId === deviceId);
    if (existingDevice) {
      skipped.push(deviceId);
      continue;
    }

    // Find in discovered devices
    const discoveredDevice = discoveredDevices.find(d => d.deviceId === deviceId);
    if (!discoveredDevice) {
      errors.push(`Device ${deviceId} not found in discovery`);
      continue;
    }

    // Create new device with proper structure using real status
    const newDevice = {
      _id: `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deviceId: discoveredDevice.deviceId,
      name: discoveredDevice.name,
      deviceType: discoveredDevice.deviceType,
      isOnline: discoveredDevice.isOnline,
      capabilities: discoveredDevice.capabilities,
      specifications: discoveredDevice.specifications,
      status: discoveredDevice.status, // Use real status from Tuya API
      tuyaData: discoveredDevice.tuyaData, // Include Tuya-specific data
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    importedDevices.push(newDevice);
    imported++;
  }

    console.log(`Import result: ${imported} imported, ${skipped.length} skipped, ${errors.length} errors`);

    res.json({
      success: true,
      data: {
        imported,
        skipped: skipped.length,
        errors
      },
      message: `Successfully imported ${imported} devices${skipped.length > 0 ? `, skipped ${skipped.length} already imported` : ''}`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Import error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to import devices. Check your Tuya credentials and device linking.',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Device control endpoints
app.post('/api/devices/:deviceId/commands', async (req, res) => {
  const { deviceId } = req.params;
  const { command, parameters } = req.body;
  
  console.log(`Device control: ${deviceId}, command: ${command}, params:`, parameters);
  
  // Find device in storage
  const device = importedDevices.find(d => d._id === deviceId || d.deviceId === deviceId);
  if (!device) {
    return res.status(404).json({
      success: false,
      message: 'Device not found',
      timestamp: new Date().toISOString()
    });
  }

  if (!device.isOnline) {
    return res.status(400).json({
      success: false,
      message: 'Device is offline',
      timestamp: new Date().toISOString()
    });
  }

  // Handle switch command
  if (command === 'switch') {
    const newState = parameters?.value;
    if (typeof newState !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid switch value - must be boolean',
        timestamp: new Date().toISOString()
      });
    }

    // Check if this is a real Tuya device
    if (device.tuyaData?.uuid) {
      // Control real Tuya device
      console.log(`Controlling REAL Tuya device: ${device.deviceId}`);
      
      const commands = [{
        code: 'switch_1',  // Standard Tuya switch command
        value: newState
      }];
      
      const success = await tuyaApiService.controlDevice(device.deviceId, commands);
      
      if (success) {
        // Update local state
        device.status.switch = newState;
        device.updatedAt = new Date().toISOString();
        
        // Get updated status from Tuya
        setTimeout(async () => {
          try {
            const status = await tuyaApiService.getDeviceStatus(device.deviceId);
            console.log('Updated device status:', status);
          } catch (e) {
            console.error('Failed to get updated status:', e);
          }
        }, 1000);
        
        res.json({
          success: true,
          data: {
            deviceId: device.deviceId,
            command,
            parameters,
            result: {
              switch: newState,
              energy: device.status.energy
            },
            executedAt: new Date().toISOString()
          },
          message: `Real device ${newState ? 'turned on' : 'turned off'} successfully!`,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to control Tuya device',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Mock device - simulate as before
      device.status.switch = newState;
      device.status.energy = device.status.energy || {};
      
      // Simulate power consumption changes
      if (newState && device.deviceType === 'smart_plug') {
        device.status.energy.activePower = Math.floor(Math.random() * 500) + 50; // 50-550W
        device.status.energy.voltage = 220 + Math.floor(Math.random() * 10) - 5; // 215-225V
        device.status.energy.current = device.status.energy.activePower / device.status.energy.voltage;
      } else if (!newState) {
        device.status.energy.activePower = 0;
        device.status.energy.current = 0;
      }

      device.updatedAt = new Date().toISOString();

      res.json({
        success: true,
        data: {
          deviceId: device.deviceId,
          command,
          parameters,
          result: {
            switch: newState,
            energy: device.status.energy
          },
          executedAt: new Date().toISOString()
        },
        message: `Device ${newState ? 'turned on' : 'turned off'} successfully`,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Handle other commands (brightness, color, etc.)
    res.json({
      success: true,
      data: {
        deviceId: device.deviceId,
        command,
        parameters,
        result: { acknowledged: true },
        executedAt: new Date().toISOString()
      },
      message: `Command ${command} executed successfully`,
      timestamp: new Date().toISOString()
    });
  }
});

// Get device status
app.get('/api/devices/:deviceId/status', (req, res) => {
  const { deviceId } = req.params;
  
  const device = importedDevices.find(d => d._id === deviceId || d.deviceId === deviceId);
  if (!device) {
    return res.status(404).json({
      success: false,
      message: 'Device not found',
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    data: device.status,
    timestamp: new Date().toISOString()
  });
});

// Get single device
app.get('/api/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  
  const device = importedDevices.find(d => d._id === deviceId || d.deviceId === deviceId);
  if (!device) {
    return res.status(404).json({
      success: false,
      message: 'Device not found',
      timestamp: new Date().toISOString()
    });
  }

  res.json({
    success: true,
    data: device,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API Health: http://localhost:${PORT}/api/health`);
});