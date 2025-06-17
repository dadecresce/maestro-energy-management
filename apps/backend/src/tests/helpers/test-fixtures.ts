/**
 * Test Fixtures and Mock Data
 * 
 * Provides consistent test data and mock objects for testing
 * the Maestro energy management system.
 */

import { 
  Device, 
  DeviceCommand, 
  DeviceStatusUpdate, 
  DeviceDiscovery,
  CommandResult,
  DeviceCapability
} from '@maestro/shared/types';

/**
 * Create mock Tuya device data for testing
 */
export function createMockTuyaDevice(overrides: Partial<any> = {}): any {
  const baseDevice = {
    id: `tuya-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Smart Plug',
    local_key: 'test-local-key',
    category: 'cz', // Smart plug category
    product_id: 'test-product-id',
    product_name: 'Smart Plug Pro',
    sub_category: 'switch',
    icon: 'https://example.com/icon.png',
    ip: '192.168.1.100',
    lat: '0.0',
    lon: '0.0',
    model: 'TSP-001',
    time_zone: '+00:00',
    active_time: Date.now(),
    create_time: Date.now() - 86400000, // 1 day ago
    update_time: Date.now(),
    online: true,
    status: [
      {
        code: 'switch_1',
        value: false,
        type: 'Boolean'
      },
      {
        code: 'cur_power',
        value: 0,
        type: 'Integer'
      }
    ],
    functions: [
      {
        code: 'switch_1',
        desc: 'Switch control',
        name: 'Switch',
        type: 'Boolean',
        values: '{"range":["true","false"]}'
      },
      {
        code: 'cur_power',
        desc: 'Current power consumption',
        name: 'Current Power',
        type: 'Integer',
        values: '{"unit":"W","min":0,"max":3680,"scale":0,"step":1}'
      }
    ]
  };

  return { ...baseDevice, ...overrides };
}

/**
 * Create mock device data for API testing
 */
export function createMockDeviceData(overrides: Partial<any> = {}): DeviceDiscovery {
  const baseDevice: DeviceDiscovery = {
    protocol: 'tuya',
    deviceId: `mock-${Math.random().toString(36).substr(2, 9)}`,
    deviceType: 'smart_plug',
    name: 'Mock Smart Plug',
    specifications: {
      manufacturer: 'Tuya',
      model: 'Smart Plug Pro',
      maxPower: 3680,
      voltage: 230,
      phases: 1,
      certifications: ['CE', 'FCC']
    },
    capabilities: [
      {
        type: 'switch',
        properties: { writable: true },
        commands: ['turn_on', 'turn_off', 'toggle'],
        readOnly: false
      },
      {
        type: 'energy_meter',
        properties: { 
          writable: false,
          unit: 'W',
          range: { min: 0, max: 3680 }
        },
        commands: ['get_power'],
        readOnly: true
      }
    ],
    networkInfo: {
      ipAddress: '192.168.1.100',
      networkId: 'test-network'
    },
    discoveredAt: new Date(),
    confidence: 1.0
  };

  return { ...baseDevice, ...overrides };
}

/**
 * Create mock device for database storage
 */
export function createMockDevice(overrides: Partial<Device> = {}): Device {
  const baseDevice: Device = {
    _id: `device-${Math.random().toString(36).substr(2, 9)}`,
    userId: 'test-user-123',
    deviceId: `tuya-${Math.random().toString(36).substr(2, 9)}`,
    protocol: 'tuya',
    deviceType: 'smart_plug',
    capabilities: [
      {
        type: 'switch',
        properties: { writable: true },
        commands: ['turn_on', 'turn_off', 'toggle'],
        readOnly: false
      },
      {
        type: 'energy_meter',
        properties: { 
          writable: false,
          unit: 'W'
        },
        commands: ['get_power'],
        readOnly: true
      }
    ],
    name: 'Test Smart Plug',
    description: 'A test smart plug device',
    location: 'Test Room',
    room: 'Test Room',
    floor: 'Ground Floor',
    building: 'Test Building',
    specifications: {
      manufacturer: 'Tuya',
      model: 'Smart Plug Pro',
      firmwareVersion: '1.2.3',
      maxPower: 3680,
      voltage: 230,
      phases: 1,
      certifications: ['CE', 'FCC']
    },
    isOnline: true,
    status: 'online',
    lastSeenAt: new Date(),
    currentState: {
      power: false,
      energyConsumption: 0,
      voltage: 230,
      current: 0
    },
    settings: {
      autoControl: false,
      schedules: [],
      alerts: [],
      energyOptimization: false,
      loadPriority: 5,
      customProperties: {}
    },
    createdAt: new Date(),
    updatedAt: new Date()
  } as Device;

  return { ...baseDevice, ...overrides };
}

/**
 * Create mock device command
 */
export function createMockDeviceCommand(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  const baseCommand: DeviceCommand = {
    deviceId: 'test-device-123',
    command: 'turn_on',
    parameters: {},
    timestamp: new Date()
  };

  return { ...baseCommand, ...overrides };
}

/**
 * Create mock command result
 */
export function createMockCommandResult(overrides: Partial<CommandResult> = {}): CommandResult {
  const baseResult: CommandResult = {
    success: true,
    timestamp: new Date(),
    responseTime: 250,
    result: { power: true },
    retryCount: 0
  };

  return { ...baseResult, ...overrides };
}

/**
 * Create mock device status update
 */
export function createMockDeviceStatusUpdate(overrides: Partial<DeviceStatusUpdate> = {}): DeviceStatusUpdate {
  const baseUpdate: DeviceStatusUpdate = {
    deviceId: 'test-device-123',
    status: 'online',
    state: {
      power: true,
      energyConsumption: 150.5,
      voltage: 230.2,
      current: 0.65
    },
    timestamp: new Date(),
    source: 'polling'
  };

  return { ...baseUpdate, ...overrides };
}

/**
 * Create mock user data
 */
export function createMockUser(overrides: any = {}): any {
  const baseUser = {
    _id: `user-${Math.random().toString(36).substr(2, 9)}`,
    email: `test${Math.random().toString(36).substr(2, 5)}@example.com`,
    name: 'Test User',
    hashedPassword: 'test-password-hash',
    role: 'user',
    preferences: {
      theme: 'light',
      language: 'en',
      notifications: true,
      dashboard: {
        layout: 'grid',
        refreshInterval: 30000
      }
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
    isActive: true
  };

  return { ...baseUser, ...overrides };
}

/**
 * Create mock energy measurement
 */
export function createMockEnergyMeasurement(overrides: any = {}): any {
  const baseMeasurement = {
    _id: `energy-${Math.random().toString(36).substr(2, 9)}`,
    deviceId: 'test-device-123',
    userId: 'test-user-123',
    timestamp: new Date(),
    measurements: {
      power: Math.random() * 1000, // 0-1000W
      voltage: 230 + (Math.random() * 10 - 5), // 225-235V
      current: Math.random() * 5, // 0-5A
      energy: Math.random() * 2, // 0-2 kWh
      powerFactor: 0.95 + (Math.random() * 0.1 - 0.05) // 0.9-1.0
    },
    source: 'polling'
  };

  return { ...baseMeasurement, ...overrides };
}

/**
 * Create mock WebSocket message
 */
export function createMockWebSocketMessage(type: string, data: any = {}): any {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...data
  };
}

/**
 * Create mock API response
 */
export function createMockApiResponse(data: any = {}, success = true): any {
  return {
    success,
    data,
    timestamp: new Date().toISOString(),
    requestId: `test-${Math.random().toString(36).substr(2, 9)}`
  };
}

/**
 * Create mock error response
 */
export function createMockErrorResponse(error: string, code?: string, statusCode = 500): any {
  return {
    success: false,
    error,
    code,
    statusCode,
    timestamp: new Date().toISOString(),
    requestId: `test-${Math.random().toString(36).substr(2, 9)}`
  };
}

/**
 * Create array of mock devices for bulk testing
 */
export function createMockDeviceArray(count: number, overrides: Partial<Device> = {}): Device[] {
  const devices: Device[] = [];
  
  for (let i = 0; i < count; i++) {
    devices.push(createMockDevice({
      name: `Test Device ${i + 1}`,
      deviceId: `test-device-${i + 1}`,
      room: `Room ${i + 1}`,
      ...overrides
    }));
  }
  
  return devices;
}

/**
 * Create mock protocol adapter configuration
 */
export function createMockAdapterConfig(protocol: string = 'tuya'): any {
  const configs: Record<string, any> = {
    tuya: {
      protocol: 'tuya',
      name: 'Test Tuya Adapter',
      enabled: true,
      connectionTimeout: 10000,
      commandTimeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      maxConcurrentCommands: 10,
      authentication: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        baseUrl: 'https://test-api.tuya.com',
        region: 'eu'
      },
      options: {
        pollingInterval: 30000,
        enableWebhooks: false,
        maxDevicesPerRequest: 100,
        cacheTTL: 300000
      }
    },
    modbus: {
      protocol: 'modbus',
      name: 'Test Modbus Adapter',
      enabled: true,
      connectionTimeout: 5000,
      commandTimeout: 3000,
      retryAttempts: 3,
      retryDelay: 500,
      maxConcurrentCommands: 5,
      options: {
        host: '192.168.1.100',
        port: 502,
        unitId: 1,
        timeout: 3000
      }
    }
  };

  return configs[protocol] || configs.tuya;
}

/**
 * Generate realistic time series data for testing
 */
export function generateTimeSeriesData(
  deviceId: string,
  hours: number = 24,
  interval: number = 3600000 // 1 hour in milliseconds
): any[] {
  const data: any[] = [];
  const now = Date.now();
  
  for (let i = 0; i < hours; i++) {
    const timestamp = new Date(now - (i * interval));
    
    // Generate realistic power consumption pattern
    const hour = timestamp.getHours();
    let basePower = 0;
    
    // Simulate daily usage pattern
    if (hour >= 6 && hour <= 9) {
      basePower = 800; // Morning usage
    } else if (hour >= 12 && hour <= 14) {
      basePower = 600; // Lunch time
    } else if (hour >= 18 && hour <= 22) {
      basePower = 1000; // Evening usage
    } else if (hour >= 23 || hour <= 5) {
      basePower = 200; // Night time standby
    } else {
      basePower = 400; // Daytime background
    }
    
    // Add some randomness
    const power = basePower + (Math.random() * 200 - 100);
    const voltage = 230 + (Math.random() * 10 - 5);
    const current = power / voltage;
    
    data.push({
      _id: `energy-${deviceId}-${i}`,
      deviceId,
      timestamp,
      measurements: {
        power: Math.max(0, power),
        voltage,
        current,
        energy: power / 1000, // Convert to kWh
        powerFactor: 0.95 + (Math.random() * 0.1 - 0.05)
      },
      source: 'polling'
    });
  }
  
  return data.reverse(); // Return in chronological order
}

/**
 * Create realistic device discovery scenarios
 */
export function createDiscoveryScenarios(): Record<string, DeviceDiscovery[]> {
  return {
    empty: [],
    
    singleDevice: [
      createMockDeviceData({
        deviceId: 'tuya-plug-001',
        name: 'Living Room Plug'
      })
    ],
    
    multipleDevices: [
      createMockDeviceData({
        deviceId: 'tuya-plug-001',
        name: 'Living Room Plug',
        networkInfo: { ipAddress: '192.168.1.101' }
      }),
      createMockDeviceData({
        deviceId: 'tuya-plug-002',
        name: 'Kitchen Plug',
        networkInfo: { ipAddress: '192.168.1.102' }
      }),
      createMockDeviceData({
        deviceId: 'tuya-plug-003',
        name: 'Bedroom Plug',
        networkInfo: { ipAddress: '192.168.1.103' }
      })
    ],
    
    mixedTypes: [
      createMockDeviceData({
        deviceId: 'tuya-plug-001',
        deviceType: 'smart_plug',
        name: 'Smart Plug'
      }),
      createMockDeviceData({
        deviceId: 'tuya-inverter-001',
        deviceType: 'solar_inverter',
        name: 'Solar Inverter',
        specifications: {
          manufacturer: 'SolarTech',
          model: 'ST-3000',
          maxPower: 3000
        }
      }),
      createMockDeviceData({
        deviceId: 'tuya-battery-001',
        deviceType: 'battery_pack',
        name: 'Battery Pack',
        specifications: {
          manufacturer: 'BatteryTech',
          model: 'BT-5000',
          capacity: 5000
        }
      })
    ]
  };
}

/**
 * Create mock JWT tokens for testing
 */
export function createMockJWTTokens(): Record<string, string> {
  return {
    valid: 'test-jwt-valid-token',
    expired: 'test-jwt-expired-token',
    invalid: 'test-jwt-invalid-token',
    admin: 'test-jwt-admin-token',
    user: 'test-jwt-user-token'
  };
}

/**
 * Wait helper for async testing
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create timeout promise for testing timeouts
 */
export function createTimeoutPromise<T>(ms: number, value?: T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (value !== undefined) {
        resolve(value);
      } else {
        reject(new Error('Timeout'));
      }
    }, ms);
  });
}