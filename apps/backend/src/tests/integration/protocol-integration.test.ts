import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';

import { DatabaseManager } from '@/services/database';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { DeviceIntegrationService } from '@/services/device-integration';
import { WebSocketManager } from '@/services/websocket';
import { WebSocketIntegrationService } from '@/services/websocket-integration';
import { CacheManager } from '@/services/cache';
import { TuyaAdapter } from '@maestro/protocol-adapters/tuya/adapter';
import { DeviceService } from '@/services/database/DeviceService';
import { createTestApp } from '../helpers/test-app';
import { createTestDatabase } from '../helpers/test-database';
import { createMockTuyaDevice, createMockDeviceData } from '../helpers/test-fixtures';
import logger from '@/config/logger';

/**
 * Protocol Integration Tests
 * 
 * Comprehensive integration tests that verify the complete flow from
 * API endpoints through protocol adapters to real device operations.
 * 
 * Test Coverage:
 * - Device discovery via API and WebSocket
 * - Device command execution with real-time feedback
 * - Status monitoring and caching
 * - Error handling and retry logic
 * - WebSocket real-time updates
 * - Protocol adapter integration
 */

describe('Protocol Integration Tests', () => {
  let app: any;
  let server: Server;
  let dbManager: DatabaseManager;
  let protocolManager: ProtocolAdapterManager;
  let deviceIntegration: DeviceIntegrationService;
  let wsManager: WebSocketManager;
  let wsIntegration: WebSocketIntegrationService;
  let cache: CacheManager;
  let deviceService: DeviceService;
  let clientSocket: ClientSocket;
  let mockTuyaAdapter: jest.Mocked<TuyaAdapter>;

  const TEST_USER_ID = 'test-user-123';
  const TEST_JWT_TOKEN = 'test-jwt-token';
  const TEST_DEVICE_ID = 'test-device-abc';
  const TUYA_DEVICE_ID = 'tuya-device-xyz';

  beforeAll(async () => {
    // Setup test database
    dbManager = await createTestDatabase();
    
    // Setup cache
    cache = new CacheManager();
    await cache.initialize();

    // Setup protocol manager with mocked Tuya adapter
    protocolManager = new ProtocolAdapterManager();
    
    // Create mock Tuya adapter
    mockTuyaAdapter = createMockTuyaAdapter();
    (protocolManager as any).adapters.set('tuya', mockTuyaAdapter);

    // Setup WebSocket manager
    const { app: testApp, server: testServer, wsManager: testWsManager } = await createTestApp(
      dbManager,
      cache,
      protocolManager
    );
    
    app = testApp;
    server = testServer;
    wsManager = testWsManager;

    // Setup device service
    deviceService = new DeviceService(dbManager.getDevicesCollection());

    // Setup integration services
    deviceIntegration = new DeviceIntegrationService(
      deviceService,
      protocolManager,
      wsManager,
      cache
    );

    wsIntegration = new WebSocketIntegrationService(
      wsManager,
      deviceIntegration,
      deviceService
    );

    await deviceIntegration.initialize();
    wsIntegration.initialize();

    logger.info('Integration test setup completed');
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    
    if (deviceIntegration) {
      await deviceIntegration.shutdown();
    }
    
    if (server) {
      server.close();
    }
    
    if (cache) {
      await cache.shutdown();
    }
    
    if (dbManager) {
      await dbManager.disconnect();
    }
  });

  beforeEach(async () => {
    // Clear database collections
    await dbManager.getDevicesCollection().deleteMany({});
    await dbManager.getUsersCollection().deleteMany({});

    // Clear cache
    await cache.clear();

    // Reset mock adapter
    jest.clearAllMocks();
    mockTuyaAdapter.isConnected.mockReturnValue(true);
    mockTuyaAdapter.initialize.mockResolvedValue();

    // Setup test user
    await dbManager.getUsersCollection().insertOne({
      _id: TEST_USER_ID,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Setup WebSocket client
    if (clientSocket) {
      clientSocket.disconnect();
    }
    
    clientSocket = Client(`http://localhost:${process.env.TEST_PORT || 3001}`, {
      auth: { token: TEST_JWT_TOKEN },
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Device Discovery Integration', () => {
    test('should discover devices via API endpoint', async () => {
      // Setup mock discovery response
      const mockDevices = [
        createMockDeviceData({
          deviceId: 'tuya-plug-001',
          name: 'Smart Plug 1',
          deviceType: 'smart_plug'
        }),
        createMockDeviceData({
          deviceId: 'tuya-plug-002',
          name: 'Smart Plug 2',
          deviceType: 'smart_plug'
        })
      ];

      mockTuyaAdapter.discoverDevices.mockResolvedValue(mockDevices);

      // Test API discovery
      const response = await request(app)
        .post('/api/v1/devices/discover')
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .send({
          protocol: 'tuya',
          filters: { timeout: 10000 }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.discovered).toHaveLength(2);
      expect(response.body.data.summary.total).toBe(2);
      expect(response.body.data.summary.new).toBe(2);

      // Verify protocol adapter was called correctly
      expect(mockTuyaAdapter.discoverDevices).toHaveBeenCalledWith({
        timeout: 10000
      });
    });

    test('should handle device discovery via WebSocket', async () => {
      const mockDevices = [createMockDeviceData()];
      mockTuyaAdapter.discoverDevices.mockResolvedValue(mockDevices);

      const discoveryPromise = new Promise<any>((resolve) => {
        clientSocket.on('devices:discovery:completed', resolve);
      });

      // Start discovery via WebSocket
      clientSocket.emit('devices:discover', {
        protocol: 'tuya',
        timeout: 5000
      });

      const result = await discoveryPromise;

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].protocol).toBe('tuya');
    });

    test('should cache discovery results', async () => {
      const mockDevices = [createMockDeviceData()];
      mockTuyaAdapter.discoverDevices.mockResolvedValue(mockDevices);

      // First discovery call
      await request(app)
        .post('/api/v1/devices/discover')
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .send({ protocol: 'tuya' })
        .expect(200);

      // Second discovery call should use cache
      await request(app)
        .post('/api/v1/devices/discover')
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .send({ protocol: 'tuya' })
        .expect(200);

      // Adapter should only be called once (first call)
      expect(mockTuyaAdapter.discoverDevices).toHaveBeenCalledTimes(1);
    });
  });

  describe('Device Command Execution Integration', () => {
    let testDevice: any;

    beforeEach(async () => {
      // Create test device in database
      testDevice = {
        _id: TEST_DEVICE_ID,
        userId: TEST_USER_ID,
        deviceId: TUYA_DEVICE_ID,
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug',
        isOnline: true,
        status: 'online',
        currentState: { power: false },
        capabilities: ['switch', 'energy_meter'],
        specifications: { maxPower: 3680 },
        settings: { autoControl: false },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await deviceService.create(testDevice);
    });

    test('should execute device command via API with real-time feedback', async () => {
      // Setup mock command response
      mockTuyaAdapter.sendCommand.mockResolvedValue({
        success: true,
        timestamp: new Date(),
        responseTime: 245,
        result: { power: true, energyConsumption: 0 }
      });

      // Test command execution
      const response = await request(app)
        .post(`/api/v1/devices/${TEST_DEVICE_ID}/command`)
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .send({
          command: 'turn_on',
          parameters: {}
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.result.executed).toBe(true);
      expect(response.body.data.result.newState.power).toBe(true);

      // Verify command was sent to adapter
      expect(mockTuyaAdapter.sendCommand).toHaveBeenCalledWith(
        TUYA_DEVICE_ID,
        expect.objectContaining({
          command: 'turn_on',
          parameters: {}
        })
      );

      // Verify device state was updated in database
      const updatedDevice = await deviceService.findById(TEST_DEVICE_ID);
      expect(updatedDevice?.currentState.power).toBe(true);
    });

    test('should handle device command via WebSocket with real-time updates', async () => {
      mockTuyaAdapter.sendCommand.mockResolvedValue({
        success: true,
        timestamp: new Date(),
        responseTime: 150,
        result: { power: true }
      });

      const commandPromise = new Promise<any>((resolve) => {
        clientSocket.on('device:command:result', resolve);
      });

      // Subscribe to device updates
      clientSocket.emit('device:subscribe:stream', {
        deviceId: TEST_DEVICE_ID,
        streamTypes: ['status', 'commands']
      });

      // Execute command
      clientSocket.emit('device:command:execute', {
        deviceId: TEST_DEVICE_ID,
        command: 'turn_on',
        priority: 'normal'
      });

      const result = await commandPromise;

      expect(result.result.success).toBe(true);
      expect(result.deviceId).toBe(TEST_DEVICE_ID);
      expect(result.command).toBe('turn_on');
    });

    test('should handle command failures with retry logic', async () => {
      // Mock command to fail first two times, then succeed
      mockTuyaAdapter.sendCommand
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Device busy'))
        .mockResolvedValueOnce({
          success: true,
          timestamp: new Date(),
          responseTime: 300,
          result: { power: true },
          retryCount: 2
        });

      const response = await request(app)
        .post(`/api/v1/devices/${TEST_DEVICE_ID}/command`)
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .send({
          command: 'turn_on',
          parameters: {}
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockTuyaAdapter.sendCommand).toHaveBeenCalledTimes(3);
    });

    test('should handle bulk device commands', async () => {
      // Create additional test devices
      const device2Id = 'test-device-def';
      const device3Id = 'test-device-ghi';

      await deviceService.create({
        _id: device2Id,
        userId: TEST_USER_ID,
        deviceId: 'tuya-device-2',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug 2',
        isOnline: true,
        status: 'online',
        currentState: { power: false },
        capabilities: ['switch'],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await deviceService.create({
        _id: device3Id,
        userId: TEST_USER_ID,
        deviceId: 'tuya-device-3',
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug 3',
        isOnline: true,
        status: 'online',
        currentState: { power: false },
        capabilities: ['switch'],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      mockTuyaAdapter.sendCommand.mockResolvedValue({
        success: true,
        timestamp: new Date(),
        responseTime: 200,
        result: { power: true }
      });

      const bulkCompletedPromise = new Promise<any>((resolve) => {
        clientSocket.on('devices:command:bulk:completed', resolve);
      });

      // Execute bulk command
      clientSocket.emit('devices:command:bulk', {
        deviceIds: [TEST_DEVICE_ID, device2Id, device3Id],
        command: 'turn_on',
        parameters: {}
      });

      const result = await bulkCompletedPromise;

      expect(result.summary.total).toBe(3);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(mockTuyaAdapter.sendCommand).toHaveBeenCalledTimes(3);
    });
  });

  describe('Device Status Monitoring Integration', () => {
    let testDevice: any;

    beforeEach(async () => {
      testDevice = {
        _id: TEST_DEVICE_ID,
        userId: TEST_USER_ID,
        deviceId: TUYA_DEVICE_ID,
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug',
        isOnline: true,
        status: 'online',
        currentState: { power: true, energyConsumption: 145.6 },
        capabilities: ['switch', 'energy_meter'],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSeenAt: new Date()
      };

      await deviceService.create(testDevice);
    });

    test('should get device status with caching', async () => {
      const mockStatus = {
        deviceId: TUYA_DEVICE_ID,
        status: 'online' as const,
        state: { power: true, energyConsumption: 150.2 },
        timestamp: new Date(),
        source: 'polling' as const
      };

      mockTuyaAdapter.getDeviceStatus.mockResolvedValue(mockStatus);

      // First status request (should hit adapter)
      const response1 = await request(app)
        .get(`/api/v1/devices/${TEST_DEVICE_ID}/status`)
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .expect(200);

      expect(response1.body.data.status).toBe('online');
      expect(response1.body.data.state.energyConsumption).toBe(150.2);

      // Second status request within cache TTL (should use cache)
      const response2 = await request(app)
        .get(`/api/v1/devices/${TEST_DEVICE_ID}/status`)
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .expect(200);

      expect(response2.body.data.status).toBe('online');
      
      // Adapter should only be called once
      expect(mockTuyaAdapter.getDeviceStatus).toHaveBeenCalledTimes(1);
    });

    test('should stream real-time device updates via WebSocket', async () => {
      const updatePromise = new Promise<any>((resolve) => {
        clientSocket.on('device:stream:update', resolve);
      });

      // Subscribe to device stream
      clientSocket.emit('device:subscribe:stream', {
        deviceId: TEST_DEVICE_ID,
        streamTypes: ['status']
      });

      // Simulate device status update
      const statusUpdate = {
        deviceId: TUYA_DEVICE_ID,
        status: 'online' as const,
        state: { power: false, energyConsumption: 0 },
        timestamp: new Date(),
        source: 'polling' as const
      };

      // Trigger update through device integration service
      deviceIntegration.emit('deviceUpdate', statusUpdate);

      const update = await updatePromise;

      expect(update.deviceId).toBe(TUYA_DEVICE_ID);
      expect(update.type).toBe('status_update');
      expect(update.status.state.power).toBe(false);
    });

    test('should handle device connectivity issues', async () => {
      // Mock adapter to simulate device going offline
      mockTuyaAdapter.getDeviceStatus.mockRejectedValue(new Error('Device unreachable'));
      mockTuyaAdapter.testDeviceConnection.mockResolvedValue(false);

      const response = await request(app)
        .get(`/api/v1/devices/${TEST_DEVICE_ID}/status?refresh=true`)
        .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
        .expect(200);

      // Should return cached/database status when device is unreachable
      expect(response.body.data.source).toBe('cached');
      
      // Device should be marked as offline in database
      const updatedDevice = await deviceService.findById(TEST_DEVICE_ID);
      expect(updatedDevice?.isOnline).toBe(false);
    });
  });

  describe('Error Handling and Diagnostics', () => {
    test('should provide comprehensive device diagnostics', async () => {
      const testDevice = {
        _id: TEST_DEVICE_ID,
        userId: TEST_USER_ID,
        deviceId: TUYA_DEVICE_ID,
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug',
        isOnline: true,
        status: 'online',
        currentState: { power: true },
        capabilities: ['switch'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await deviceService.create(testDevice);

      // Mock diagnostics
      mockTuyaAdapter.getDiagnostics.mockResolvedValue({
        protocol: 'tuya',
        connected: true,
        tokenValid: true,
        lastPollTime: new Date()
      });

      const diagnosticsPromise = new Promise<any>((resolve) => {
        clientSocket.on('device:diagnostics:response', resolve);
      });

      clientSocket.emit('device:diagnostics:get', {
        deviceId: TEST_DEVICE_ID
      });

      const result = await diagnosticsPromise;

      expect(result.diagnostics.device.protocol).toBe('tuya');
      expect(result.diagnostics.protocol.connected).toBe(true);
      expect(result.diagnostics.connection).toBeDefined();
    });

    test('should handle protocol adapter disconnection gracefully', async () => {
      const testDevice = {
        _id: TEST_DEVICE_ID,
        userId: TEST_USER_ID,
        deviceId: TUYA_DEVICE_ID,
        protocol: 'tuya',
        deviceType: 'smart_plug',
        name: 'Test Smart Plug',
        isOnline: true,
        status: 'online',
        currentState: { power: true },
        capabilities: ['switch'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await deviceService.create(testDevice);

      // Simulate adapter disconnection
      mockTuyaAdapter.isConnected.mockReturnValue(false);
      protocolManager.emit('adapterDisconnected', 'tuya', 'Connection lost');

      // Wait a bit for the event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Device should be marked as offline
      const updatedDevice = await deviceService.findById(TEST_DEVICE_ID);
      expect(updatedDevice?.isOnline).toBe(false);
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent device commands efficiently', async () => {
      // Create multiple test devices
      const deviceIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const deviceId = `test-device-${i}`;
        deviceIds.push(deviceId);
        
        await deviceService.create({
          _id: deviceId,
          userId: TEST_USER_ID,
          deviceId: `tuya-device-${i}`,
          protocol: 'tuya',
          deviceType: 'smart_plug',
          name: `Test Plug ${i}`,
          isOnline: true,
          status: 'online',
          currentState: { power: false },
          capabilities: ['switch'],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      mockTuyaAdapter.sendCommand.mockResolvedValue({
        success: true,
        timestamp: new Date(),
        responseTime: 100,
        result: { power: true }
      });

      const startTime = Date.now();

      // Execute commands concurrently
      const commandPromises = deviceIds.map(deviceId =>
        request(app)
          .post(`/api/v1/devices/${deviceId}/command`)
          .set('Authorization', `Bearer ${TEST_JWT_TOKEN}`)
          .send({ command: 'turn_on' })
      );

      const responses = await Promise.all(commandPromises);
      const duration = Date.now() - startTime;

      // All commands should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should complete within reasonable time (less than 5 seconds for 10 devices)
      expect(duration).toBeLessThan(5000);

      console.log(`Executed ${deviceIds.length} concurrent commands in ${duration}ms`);
    });

    test('should maintain performance with many WebSocket connections', async () => {
      // Create multiple WebSocket connections
      const clients: ClientSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      for (let i = 0; i < 20; i++) {
        const client = Client(`http://localhost:${process.env.TEST_PORT || 3001}`, {
          auth: { token: `test-token-${i}` },
          transports: ['websocket']
        });

        clients.push(client);
        
        connectionPromises.push(new Promise<void>((resolve) => {
          client.on('connect', () => resolve());
        }));
      }

      // Wait for all connections
      await Promise.all(connectionPromises);

      // Get connection stats
      const stats = wsManager.getConnectionStats();
      expect(stats.totalConnections).toBeGreaterThanOrEqual(20);

      // Cleanup
      clients.forEach(client => client.disconnect());
    });
  });

  // Helper function to create mock Tuya adapter
  function createMockTuyaAdapter(): jest.Mocked<TuyaAdapter> {
    const mockAdapter = {
      initialize: jest.fn(),
      disconnect: jest.fn(),
      discoverDevices: jest.fn(),
      getDeviceInfo: jest.fn(),
      sendCommand: jest.fn(),
      getDeviceStatus: jest.fn(),
      subscribeToUpdates: jest.fn(),
      unsubscribeFromUpdates: jest.fn(),
      testDeviceConnection: jest.fn(),
      getDiagnostics: jest.fn(),
      isConnected: jest.fn(),
      getProtocol: jest.fn(() => 'tuya'),
      supportsDeviceType: jest.fn(() => true),
      supportsCapability: jest.fn(() => true),
      validateCommand: jest.fn(() => Promise.resolve(true)),
      getConfig: jest.fn(),
      getConnectionStatus: jest.fn(),
      getStats: jest.fn(),
      getActiveSubscriptions: jest.fn(() => []),
      updateConfig: jest.fn(),
      setEnabled: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn()
    } as any;

    return mockAdapter;
  }
});

// Helper functions for test fixtures
function createMockDeviceData(overrides: any = {}): any {
  return {
    protocol: 'tuya',
    deviceId: 'mock-device-' + Math.random().toString(36).substr(2, 9),
    deviceType: 'smart_plug',
    name: 'Mock Smart Plug',
    specifications: {
      manufacturer: 'Tuya',
      model: 'Smart Plug Pro',
      maxPower: 3680
    },
    capabilities: [
      {
        type: 'switch',
        properties: { writable: true },
        commands: ['turn_on', 'turn_off', 'toggle']
      }
    ],
    networkInfo: {
      ipAddress: '192.168.1.100',
      networkId: 'test-network'
    },
    discoveredAt: new Date(),
    confidence: 1.0,
    ...overrides
  };
}