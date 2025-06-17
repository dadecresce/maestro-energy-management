import { MongoMemoryServer } from 'mongodb-memory-server';
import { DatabaseManager } from '@/services/database';

/**
 * Test Database Utilities
 * 
 * Provides utilities for creating and managing test databases
 * using MongoDB Memory Server for isolated testing.
 */

let mongoServer: MongoMemoryServer;
let testDbManager: DatabaseManager;

/**
 * Create a test database using MongoDB Memory Server
 */
export async function createTestDatabase(): Promise<DatabaseManager> {
  // Create in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'maestro-test',
      port: 0, // Random port
    },
    binary: {
      version: '6.0.0'
    }
  });

  const uri = mongoServer.getUri();
  
  // Create database manager
  testDbManager = new DatabaseManager();
  
  // Override connection string for test
  (testDbManager as any).connectionString = uri;
  
  await testDbManager.connect();
  
  // Create indexes for faster test queries
  await createTestIndexes(testDbManager);
  
  console.log(`Test database created at ${uri}`);
  
  return testDbManager;
}

/**
 * Clean up test database
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (testDbManager) {
    await testDbManager.disconnect();
  }
  
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Clear all collections in test database
 */
export async function clearTestDatabase(dbManager: DatabaseManager): Promise<void> {
  const collections = [
    dbManager.getUsersCollection(),
    dbManager.getDevicesCollection(),
    dbManager.getDeviceCommandsCollection(),
    dbManager.getEnergyMeasurementsCollection(),
    dbManager.getSessionsCollection(),
    dbManager.getUserPreferencesCollection()
  ];

  await Promise.all(
    collections.map(collection => collection.deleteMany({}))
  );
}

/**
 * Create test-specific indexes for better performance
 */
async function createTestIndexes(dbManager: DatabaseManager): Promise<void> {
  try {
    // User collection indexes
    await dbManager.getUsersCollection().createIndex({ email: 1 }, { unique: true });
    
    // Device collection indexes
    await dbManager.getDevicesCollection().createIndex({ userId: 1 });
    await dbManager.getDevicesCollection().createIndex({ deviceId: 1 });
    await dbManager.getDevicesCollection().createIndex({ userId: 1, deviceId: 1 }, { unique: true });
    await dbManager.getDevicesCollection().createIndex({ protocol: 1 });
    await dbManager.getDevicesCollection().createIndex({ deviceType: 1 });
    await dbManager.getDevicesCollection().createIndex({ isOnline: 1 });
    
    // Device commands indexes
    await dbManager.getDeviceCommandsCollection().createIndex({ deviceId: 1 });
    await dbManager.getDeviceCommandsCollection().createIndex({ userId: 1 });
    await dbManager.getDeviceCommandsCollection().createIndex({ timestamp: -1 });
    await dbManager.getDeviceCommandsCollection().createIndex({ deviceId: 1, timestamp: -1 });
    
    // Energy measurements indexes
    await dbManager.getEnergyMeasurementsCollection().createIndex({ deviceId: 1 });
    await dbManager.getEnergyMeasurementsCollection().createIndex({ timestamp: -1 });
    await dbManager.getEnergyMeasurementsCollection().createIndex({ deviceId: 1, timestamp: -1 });
    
    // Session collection indexes
    await dbManager.getSessionsCollection().createIndex({ sessionToken: 1 }, { unique: true });
    await dbManager.getSessionsCollection().createIndex({ userId: 1 });
    await dbManager.getSessionsCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    
    // User preferences indexes
    await dbManager.getUserPreferencesCollection().createIndex({ userId: 1 }, { unique: true });
    
    console.log('Test database indexes created');
    
  } catch (error) {
    console.warn('Error creating test indexes:', error);
  }
}

/**
 * Seed test database with sample data
 */
export async function seedTestDatabase(dbManager: DatabaseManager): Promise<{
  users: any[];
  devices: any[];
}> {
  // Clear existing data
  await clearTestDatabase(dbManager);
  
  // Create test users
  const users = [
    {
      _id: 'test-user-1',
      email: 'user1@test.com',
      name: 'Test User 1',
      hashedPassword: 'test-hash-1',
      role: 'user',
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: 'test-user-2',
      email: 'user2@test.com',
      name: 'Test User 2',
      hashedPassword: 'test-hash-2',
      role: 'user',
      preferences: {
        theme: 'dark',
        language: 'en',
        notifications: false
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  await dbManager.getUsersCollection().insertMany(users);
  
  // Create test devices
  const devices = [
    {
      _id: 'test-device-1',
      userId: 'test-user-1',
      deviceId: 'tuya-plug-001',
      protocol: 'tuya',
      deviceType: 'smart_plug',
      name: 'Living Room Plug',
      description: 'Smart plug in living room',
      location: 'Living Room',
      room: 'Living Room',
      floor: 'Ground Floor',
      specifications: {
        manufacturer: 'Tuya',
        model: 'Smart Plug Pro',
        maxPower: 3680,
        voltage: 230,
        phases: 1
      },
      capabilities: ['switch', 'energy_meter'],
      isOnline: true,
      status: 'online',
      currentState: {
        power: true,
        energyConsumption: 145.6,
        voltage: 229.8,
        current: 0.63
      },
      settings: {
        autoControl: false,
        schedules: [],
        alerts: [],
        maxPowerDraw: 3000
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date()
    },
    {
      _id: 'test-device-2',
      userId: 'test-user-1',
      deviceId: 'tuya-plug-002',
      protocol: 'tuya',
      deviceType: 'smart_plug',
      name: 'Kitchen Plug',
      description: 'Smart plug in kitchen',
      location: 'Kitchen',
      room: 'Kitchen',
      floor: 'Ground Floor',
      specifications: {
        manufacturer: 'Tuya',
        model: 'Smart Plug Pro',
        maxPower: 3680,
        voltage: 230,
        phases: 1
      },
      capabilities: ['switch', 'energy_meter'],
      isOnline: false,
      status: 'offline',
      currentState: {
        power: false,
        energyConsumption: 0
      },
      settings: {
        autoControl: false,
        schedules: [],
        alerts: [],
        maxPowerDraw: 3000
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(Date.now() - 600000) // 10 minutes ago
    },
    {
      _id: 'test-device-3',
      userId: 'test-user-2',
      deviceId: 'tuya-plug-003',
      protocol: 'tuya',
      deviceType: 'smart_plug',
      name: 'Office Plug',
      description: 'Smart plug in home office',
      location: 'Home Office',
      room: 'Office',
      floor: 'First Floor',
      specifications: {
        manufacturer: 'Tuya',
        model: 'Smart Plug Pro',
        maxPower: 3680,
        voltage: 230,
        phases: 1
      },
      capabilities: ['switch', 'energy_meter'],
      isOnline: true,
      status: 'online',
      currentState: {
        power: false,
        energyConsumption: 0
      },
      settings: {
        autoControl: true,
        schedules: [
          {
            id: 'schedule-1',
            name: 'Office Hours',
            enabled: true,
            pattern: 'daily',
            startTime: '09:00',
            endTime: '17:00',
            daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
            command: { command: 'turn_on' },
            timezone: 'UTC',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        alerts: [],
        maxPowerDraw: 2000
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date()
    }
  ];
  
  await dbManager.getDevicesCollection().insertMany(devices);
  
  // Create some test device commands
  const commands = [
    {
      _id: 'test-command-1',
      deviceId: 'test-device-1',
      userId: 'test-user-1',
      command: 'turn_on',
      parameters: {},
      result: { power: true },
      success: true,
      duration: 245,
      timestamp: new Date(Date.now() - 300000), // 5 minutes ago
      source: 'api'
    },
    {
      _id: 'test-command-2',
      deviceId: 'test-device-1',
      userId: 'test-user-1',
      command: 'turn_off',
      parameters: {},
      result: { power: false },
      success: true,
      duration: 189,
      timestamp: new Date(Date.now() - 600000), // 10 minutes ago
      source: 'schedule'
    }
  ];
  
  await dbManager.getDeviceCommandsCollection().insertMany(commands);
  
  // Create some test energy measurements
  const energyMeasurements = [];
  const now = Date.now();
  
  for (let i = 0; i < 24; i++) {
    energyMeasurements.push({
      _id: `test-energy-${i}`,
      deviceId: 'test-device-1',
      userId: 'test-user-1',
      timestamp: new Date(now - (i * 60 * 60 * 1000)), // Every hour for 24 hours
      measurements: {
        power: Math.random() * 1000, // 0-1000W
        voltage: 230 + (Math.random() * 10 - 5), // 225-235V
        current: Math.random() * 5, // 0-5A
        energy: Math.random() * 2, // 0-2 kWh per hour
        powerFactor: 0.95 + (Math.random() * 0.1 - 0.05) // 0.9-1.0
      },
      source: 'polling'
    });
  }
  
  await dbManager.getEnergyMeasurementsCollection().insertMany(energyMeasurements);
  
  console.log(`Seeded test database with ${users.length} users, ${devices.length} devices, ${commands.length} commands, and ${energyMeasurements.length} energy measurements`);
  
  return { users, devices };
}

/**
 * Get test database connection info
 */
export function getTestDatabaseInfo(): { uri?: string; dbName?: string } {
  if (!mongoServer) {
    return {};
  }
  
  return {
    uri: mongoServer.getUri(),
    dbName: 'maestro-test'
  };
}

/**
 * Wait for database to be ready
 */
export async function waitForDatabase(dbManager: DatabaseManager, timeout = 5000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Try to perform a simple operation
      await dbManager.getUsersCollection().findOne({});
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  throw new Error(`Database did not become ready within ${timeout}ms`);
}