/**
 * Database Integration Tests
 * 
 * Tests the complete database integration including Mongoose models,
 * services, and compatibility with the existing authentication system.
 */

import mongoose from 'mongoose';
import { config } from '@/config/environment';
import { MongooseManager } from '@/services/database/MongooseManager';
import { UserService, DeviceService } from '@/services/database';
import { validateData, CreateUserValidation, CreateDeviceValidation } from '@/services/database/validation';
import { User, Device, Session, UserPreferences, DeviceCommand } from '@/models';
import { AuthService } from '@/services/auth';
import { CacheManager } from '@/services/cache';

// Mock implementations for testing
jest.mock('@/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

jest.mock('@/services/cache', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    setSession: jest.fn(),
    getSession: jest.fn(),
    deleteSession: jest.fn(),
    cacheUserProfile: jest.fn(),
    getUserProfile: jest.fn(),
    invalidateUserCache: jest.fn()
  }))
}));

describe('Database Integration Tests', () => {
  let mongooseManager: MongooseManager;
  let userService: UserService;
  let deviceService: DeviceService;
  let authService: AuthService;
  let testUserId: string;
  let testDeviceId: string;

  beforeAll(async () => {
    // Connect to test database
    const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/maestro_test';
    await mongoose.connect(testDbUri);

    // Initialize managers and services
    mongooseManager = new MongooseManager();
    userService = new UserService();
    deviceService = new DeviceService();
    
    const mockCache = new CacheManager({} as any);
    authService = new AuthService(mongooseManager as any, mockCache);

    // Clean up test database
    await mongoose.connection.db.dropDatabase();
    
    // Ensure indexes
    await mongooseManager.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const collection of collections) {
      await mongoose.connection.db.collection(collection.name).deleteMany({});
    }
  });

  describe('Mongoose Models', () => {
    it('should create and validate User model', async () => {
      const userData = {
        email: 'test@example.com',
        displayName: 'Test User',
        auth: [{
          provider: 'tuya',
          providerId: 'tuya123',
          accessToken: 'token123',
          lastLoginAt: new Date()
        }],
        emailVerified: true
      };

      const user = new User(userData);
      await user.save();

      expect(user._id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.auth).toHaveLength(1);
      expect(user.stats.totalDevices).toBe(0);
      expect(user.stats.loginCount).toBe(0);
    });

    it('should create and validate Device model', async () => {
      // First create a user
      const user = await User.create({
        email: 'device@example.com',
        displayName: 'Device User',
        auth: [{
          provider: 'tuya',
          providerId: 'tuya456',
          accessToken: 'token456'
        }]
      });

      const deviceData = {
        userId: user._id.toString(),
        deviceId: 'smart_plug_001',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Living Room Plug',
        specifications: {
          manufacturer: 'Smart Home Co',
          model: 'SHP-001',
          maxPower: 3500,
          voltage: 230,
          phases: 1,
          certifications: ['CE', 'RoHS']
        },
        capabilities: [{
          type: 'switch',
          properties: { state: 'boolean' },
          commands: ['turn_on', 'turn_off'],
          readOnly: false
        }],
        energyRole: 'consumer'
      };

      const device = new Device(deviceData);
      await device.save();

      expect(device._id).toBeDefined();
      expect(device.userId).toBe(user._id.toString());
      expect(device.deviceType).toBe('smart_plug');
      expect(device.capabilities).toHaveLength(1);
      expect(device.hasCapability('switch')).toBe(true);
    });

    it('should create Session model with TTL', async () => {
      const user = await User.create({
        email: 'session@example.com',
        displayName: 'Session User',
        auth: [{ provider: 'tuya', providerId: 'tuya789', accessToken: 'token789' }]
      });

      const session = await Session.create({
        userId: user._id.toString(),
        sessionToken: 'session_123',
        refreshToken: 'refresh_123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        deviceInfo: {
          userAgent: 'Test Browser',
          ipAddress: '127.0.0.1',
          platform: 'web'
        }
      });

      expect(session._id).toBeDefined();
      expect(session.userId).toBe(user._id.toString());
      expect(session.isExpired()).toBe(false);
    });

    it('should create UserPreferences with default dashboard', async () => {
      const user = await User.create({
        email: 'prefs@example.com',
        displayName: 'Prefs User',
        auth: [{ provider: 'tuya', providerId: 'tuya000', accessToken: 'token000' }]
      });

      const preferences = await UserPreferences.create({
        userId: user._id.toString()
      });

      expect(preferences._id).toBeDefined();
      expect(preferences.dashboards).toHaveLength(1);
      expect(preferences.dashboards[0].name).toBe('Main Dashboard');
      expect(preferences.activeDashboardId).toBe('default');
    });
  });

  describe('Database Services', () => {
    beforeEach(async () => {
      // Create test user for service tests
      const user = await userService.createUser(
        'service@example.com',
        'Service Test User',
        {
          provider: 'tuya',
          providerId: 'service123',
          accessToken: 'servicetoken123'
        }
      );
      testUserId = user._id.toString();
    });

    it('should create user through UserService', async () => {
      const user = await userService.createUser(
        'newuser@example.com',
        'New User',
        {
          provider: 'tuya',
          providerId: 'new123',
          accessToken: 'newtoken123'
        },
        {
          firstName: 'New',
          lastName: 'User'
        }
      );

      expect(user.email).toBe('newuser@example.com');
      expect(user.profile.firstName).toBe('New');
      expect(user.auth).toHaveLength(1);
    });

    it('should register device through DeviceService', async () => {
      const device = await deviceService.registerDevice(testUserId, {
        deviceId: 'test_device_001',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug',
        specifications: {
          manufacturer: 'Test Manufacturer',
          model: 'TEST-001',
          maxPower: 2000,
          voltage: 230,
          phases: 1,
          certifications: ['CE']
        },
        capabilities: [{
          type: 'switch',
          properties: { power: 'boolean' },
          commands: ['turn_on', 'turn_off'],
          readOnly: false
        }],
        location: 'Test Room',
        energyRole: 'consumer'
      });

      testDeviceId = device._id.toString();

      expect(device.userId).toBe(testUserId);
      expect(device.name).toBe('Test Smart Plug');
      expect(device.hasCapability('switch')).toBe(true);
    });

    it('should handle device commands', async () => {
      // First register a device
      const device = await deviceService.registerDevice(testUserId, {
        deviceId: 'cmd_device_001',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Command Test Plug',
        specifications: {
          manufacturer: 'Test Manufacturer',
          model: 'CMD-001',
          maxPower: 1500,
          voltage: 230,
          phases: 1,
          certifications: []
        },
        capabilities: [{
          type: 'switch',
          properties: { power: 'boolean' },
          commands: ['turn_on', 'turn_off'],
          readOnly: false
        }]
      });

      // Execute command
      const result = await deviceService.executeCommand(
        device._id.toString(),
        'turn_on',
        { power: true }
      );

      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);

      // Verify device was updated
      const updatedDevice = await deviceService.findById(device._id.toString());
      expect(updatedDevice?.lastCommandAt).toBeDefined();
    });

    it('should find devices by user', async () => {
      // Register multiple devices
      await deviceService.registerDevice(testUserId, {
        deviceId: 'find_device_001',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Find Test Plug 1',
        specifications: { manufacturer: 'Test', model: 'FIND-001', maxPower: 1000, voltage: 230, phases: 1, certifications: [] },
        capabilities: [{ type: 'switch', properties: {}, commands: ['turn_on'], readOnly: false }]
      });

      await deviceService.registerDevice(testUserId, {
        deviceId: 'find_device_002',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Find Test Plug 2',
        specifications: { manufacturer: 'Test', model: 'FIND-002', maxPower: 1000, voltage: 230, phases: 1, certifications: [] },
        capabilities: [{ type: 'switch', properties: {}, commands: ['turn_on'], readOnly: false }]
      });

      const devices = await deviceService.findByUser(testUserId);
      expect(devices.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle pagination', async () => {
      // Create multiple devices for pagination test
      for (let i = 0; i < 25; i++) {
        await deviceService.registerDevice(testUserId, {
          deviceId: `page_device_${i}`,
          protocol: 'tuya',
          deviceType: 'smart_plug',
          name: `Page Test Plug ${i}`,
          specifications: { manufacturer: 'Test', model: `PAGE-${i}`, maxPower: 1000, voltage: 230, phases: 1, certifications: [] },
          capabilities: [{ type: 'switch', properties: {}, commands: ['turn_on'], readOnly: false }]
        });
      }

      const page1 = await deviceService.searchDevices(testUserId, {}, { page: 1, limit: 10 });
      const page2 = await deviceService.searchDevices(testUserId, {}, { page: 2, limit: 10 });

      expect(page1.data).toHaveLength(10);
      expect(page1.pagination.page).toBe(1);
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.total).toBeGreaterThanOrEqual(25);

      expect(page2.data).toHaveLength(10);
      expect(page2.pagination.page).toBe(2);
    });
  });

  describe('Authentication Integration', () => {
    it('should integrate with existing auth service', async () => {
      const email = 'auth@example.com';
      const displayName = 'Auth Test User';
      const auth = {
        provider: 'tuya' as const,
        providerId: 'auth123',
        accessToken: 'authtoken123'
      };

      // Create user through auth service
      const user = await authService.createUser(email, displayName, auth);

      expect(user.email).toBe(email);
      expect(user.displayName).toBe(displayName);

      // Verify user can be found by auth provider
      const foundUser = await userService.findByAuth(auth.provider, auth.providerId);
      expect(foundUser?._id.toString()).toBe(user._id.toString());

      // Create session
      const session = await authService.createSession(user._id, {
        userAgent: 'Test Agent',
        ipAddress: '127.0.0.1'
      });

      expect(session.userId).toBe(user._id);
      expect(session.sessionToken).toBeDefined();

      // Complete authentication
      const authResult = await authService.completeAuthentication(user, {
        userAgent: 'Test Agent',
        ipAddress: '127.0.0.1'
      });

      expect(authResult.user.email).toBe(email);
      expect(authResult.token).toBeDefined();
      expect(authResult.sessionId).toBeDefined();
    });

    it('should handle password comparison for local auth', async () => {
      const user = await User.create({
        email: 'password@example.com',
        displayName: 'Password User',
        auth: [{
          provider: 'local',
          providerId: 'local123',
          accessToken: await authService.hashPassword('testpassword123')
        }]
      });

      const isValid = await user.comparePassword('testpassword123');
      const isInvalid = await user.comparePassword('wrongpassword');

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Validation Integration', () => {
    it('should validate user creation data', () => {
      const validData = {
        email: 'valid@example.com',
        displayName: 'Valid User',
        role: 'user',
        profile: {
          firstName: 'Valid',
          timezone: 'UTC'
        }
      };

      const result = validateData(CreateUserValidation, validData);
      expect(result.email).toBe('valid@example.com');
      expect(result.role).toBe('user');
    });

    it('should reject invalid user data', () => {
      const invalidData = {
        email: 'invalid-email',
        displayName: '', // Too short
        role: 'invalid_role'
      };

      expect(() => {
        validateData(CreateUserValidation, invalidData);
      }).toThrow();
    });

    it('should validate device creation data', () => {
      const validData = {
        deviceId: 'valid_device_001',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Valid Device',
        specifications: {
          manufacturer: 'Valid Manufacturer',
          model: 'VALID-001',
          maxPower: 2000,
          voltage: 230,
          phases: 1,
          certifications: ['CE']
        },
        capabilities: [{
          type: 'switch',
          properties: { power: 'boolean' },
          commands: ['turn_on', 'turn_off'],
          readOnly: false
        }]
      };

      const result = validateData(CreateDeviceValidation, validData);
      expect(result.deviceId).toBe('valid_device_001');
      expect(result.capabilities).toHaveLength(1);
    });
  });

  describe('Advanced Queries and Aggregations', () => {
    beforeEach(async () => {
      // Create test data for aggregation tests
      const user = await User.create({
        email: 'aggregation@example.com',
        displayName: 'Aggregation User',
        auth: [{ provider: 'tuya', providerId: 'agg123', accessToken: 'aggtoken123' }]
      });

      for (let i = 0; i < 5; i++) {
        await Device.create({
          userId: user._id.toString(),
          deviceId: `agg_device_${i}`,
          protocol: 'tuya',
          deviceType: i % 2 === 0 ? 'smart_plug' : 'energy_meter',
          name: `Aggregation Device ${i}`,
          specifications: { manufacturer: 'Agg', model: `AGG-${i}`, maxPower: 1000, voltage: 230, phases: 1, certifications: [] },
          capabilities: [{ type: 'switch', properties: {}, commands: ['turn_on'], readOnly: false }],
          isOnline: i % 3 !== 0, // Some offline devices
          energyRole: 'consumer'
        });
      }
    });

    it('should aggregate device statistics', async () => {
      const stats = await deviceService.getSystemDeviceStatistics();
      
      expect(stats).toHaveLength(1);
      expect(stats[0].totalDevices).toBeGreaterThan(0);
      expect(stats[0].onlineDevices).toBeGreaterThanOrEqual(0);
    });

    it('should get user device statistics', async () => {
      const user = await User.findOne({ email: 'aggregation@example.com' });
      const stats = await deviceService.getUserDeviceStatistics(user!._id.toString());

      expect(stats.totalDevices).toBe(5);
      expect(stats.onlineDevices).toBeGreaterThanOrEqual(0);
    });

    it('should find devices with specific capabilities', async () => {
      const user = await User.findOne({ email: 'aggregation@example.com' });
      const devicesWithSwitch = await deviceService.findWithCapability('switch', user!._id.toString());

      expect(devicesWithSwitch.length).toBe(5); // All test devices have switch capability
    });
  });

  describe('Error Handling', () => {
    it('should handle duplicate user creation', async () => {
      const userData = {
        email: 'duplicate@example.com',
        displayName: 'Duplicate User',
        auth: [{ provider: 'tuya', providerId: 'dup123', accessToken: 'duptoken123' }]
      };

      await User.create(userData);

      // Try to create another user with same email
      await expect(userService.createUser(
        'duplicate@example.com',
        'Another User',
        { provider: 'tuya', providerId: 'dup456', accessToken: 'duptoken456' }
      )).rejects.toThrow();
    });

    it('should handle device command on non-existent device', async () => {
      const fakeDeviceId = new mongoose.Types.ObjectId().toString();
      
      await expect(deviceService.executeCommand(
        fakeDeviceId,
        'turn_on',
        {}
      )).rejects.toThrow();
    });

    it('should handle invalid command for device', async () => {
      const device = await deviceService.registerDevice(testUserId, {
        deviceId: 'invalid_cmd_device',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Invalid Command Test',
        specifications: { manufacturer: 'Test', model: 'INV-001', maxPower: 1000, voltage: 230, phases: 1, certifications: [] },
        capabilities: [{ type: 'switch', properties: {}, commands: ['turn_on'], readOnly: false }]
      });

      await expect(deviceService.executeCommand(
        device._id.toString(),
        'invalid_command',
        {}
      )).rejects.toThrow();
    });
  });

  describe('Database Health and Monitoring', () => {
    it('should perform health check', async () => {
      const health = await mongooseManager.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.details.connected).toBe(true);
      expect(health.details.models).toContain('User');
      expect(health.details.models).toContain('Device');
    });

    it('should get database statistics', async () => {
      const stats = await mongooseManager.getDatabaseStats();
      
      expect(stats.database).toBeDefined();
      expect(stats.collections).toBeDefined();
      expect(stats.models).toContain('User');
    });

    it('should handle connection state', () => {
      expect(mongooseManager.isConnectedState()).toBe(true);
      expect(() => mongooseManager.getConnection()).not.toThrow();
    });
  });
});

/**
 * Performance Tests (optional, can be skipped in CI)
 */
describe('Performance Tests', () => {
  let mongooseManager: MongooseManager;
  let deviceService: DeviceService;
  let testUserId: string;

  beforeAll(async () => {
    if (process.env.SKIP_PERFORMANCE_TESTS) {
      return;
    }

    const testDbUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/maestro_perf_test';
    await mongoose.connect(testDbUri);

    mongooseManager = new MongooseManager();
    deviceService = new DeviceService();

    await mongoose.connection.db.dropDatabase();
    await mongooseManager.ensureIndexes();

    // Create test user
    const user = await User.create({
      email: 'perf@example.com',
      displayName: 'Performance User',
      auth: [{ provider: 'tuya', providerId: 'perf123', accessToken: 'perftoken123' }]
    });
    testUserId = user._id.toString();
  });

  afterAll(async () => {
    if (!process.env.SKIP_PERFORMANCE_TESTS) {
      await mongoose.connection.close();
    }
  });

  it('should handle bulk device creation efficiently', async () => {
    if (process.env.SKIP_PERFORMANCE_TESTS) {
      return;
    }

    const startTime = Date.now();
    const deviceCount = 1000;

    // Create devices in batches
    const batchSize = 100;
    for (let i = 0; i < deviceCount; i += batchSize) {
      const batch = [];
      for (let j = 0; j < batchSize && i + j < deviceCount; j++) {
        const deviceIndex = i + j;
        batch.push({
          userId: testUserId,
          deviceId: `perf_device_${deviceIndex}`,
          protocol: 'tuya',
          deviceType: 'smart_plug',
          name: `Performance Device ${deviceIndex}`,
          specifications: {
            manufacturer: 'Performance Co',
            model: `PERF-${deviceIndex}`,
            maxPower: 1000,
            voltage: 230,
            phases: 1,
            certifications: []
          },
          capabilities: [{
            type: 'switch',
            properties: {},
            commands: ['turn_on'],
            readOnly: false
          }],
          isOnline: true,
          status: 'online',
          currentState: {},
          settings: {}
        });
      }

      await Device.insertMany(batch);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Created ${deviceCount} devices in ${duration}ms (${deviceCount / (duration / 1000)} devices/sec)`);

    // Verify creation
    const count = await Device.countDocuments({ userId: testUserId });
    expect(count).toBe(deviceCount);

    // Test query performance
    const queryStart = Date.now();
    const result = await deviceService.findByUser(testUserId);
    const queryEnd = Date.now();

    console.log(`Queried ${result.length} devices in ${queryEnd - queryStart}ms`);
    expect(result.length).toBe(deviceCount);
  }, 30000); // 30 second timeout for performance test
});

export default {};