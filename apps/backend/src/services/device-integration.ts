import { EventEmitter } from 'events';
import { 
  DeviceStatusUpdate, 
  DeviceCommand, 
  CommandResult, 
  DeviceDiscovery, 
  ProtocolType,
  Device
} from '@maestro/shared/types';

import { DeviceService } from '@/services/database/DeviceService';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { WebSocketManager } from '@/services/websocket';
import { CacheManager } from '@/services/cache';
import { createError } from '@/utils/errors';
import logger, { createModuleLogger, deviceLogger } from '@/config/logger';

/**
 * Device Integration Service
 * 
 * This service acts as the bridge between API endpoints and protocol adapters,
 * providing a unified interface for device operations with caching, error handling,
 * and real-time updates.
 * 
 * Key Features:
 * - Unified device operations across all protocols
 * - Intelligent caching with TTL and invalidation
 * - Real-time status monitoring and broadcasting
 * - Comprehensive error handling and retry logic
 * - Background device discovery and monitoring
 * - Command queuing and execution tracking
 */
export class DeviceIntegrationService extends EventEmitter {
  private moduleLogger = createModuleLogger('DeviceIntegrationService');
  private deviceStatusCache: Map<string, { data: DeviceStatusUpdate; timestamp: number; ttl: number }> = new Map();
  private commandExecutions: Map<string, { command: DeviceCommand; startTime: number; retryCount: number }> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private discoveryTimeout?: NodeJS.Timeout;

  // Cache TTL configurations (in milliseconds)
  private readonly CACHE_TTLS = {
    device_status: 30000,      // 30 seconds
    device_info: 300000,       // 5 minutes
    device_capabilities: 600000, // 10 minutes
    discovery_results: 120000   // 2 minutes
  };

  // Retry configurations
  private readonly RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };

  constructor(
    private deviceService: DeviceService,
    private protocolManager: ProtocolAdapterManager,
    private wsManager: WebSocketManager,
    private cache: CacheManager
  ) {
    super();
    this.moduleLogger.info('Device integration service initialized');
    this.setupEventHandlers();
  }

  /**
   * Initialize the service and start background processes
   */
  async initialize(): Promise<void> {
    try {
      this.moduleLogger.info('Initializing device integration service...');

      // Start real-time monitoring
      await this.startDeviceMonitoring();

      // Setup protocol adapter event handlers
      this.setupProtocolAdapterHandlers();

      this.moduleLogger.info('Device integration service initialized successfully');
      this.emit('initialized');

    } catch (error) {
      this.moduleLogger.error('Failed to initialize device integration service', { error });
      throw createError.internal('Device integration initialization failed', { originalError: error });
    }
  }

  /**
   * Shutdown the service and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      this.moduleLogger.info('Shutting down device integration service...');

      // Stop monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
      }

      if (this.discoveryTimeout) {
        clearTimeout(this.discoveryTimeout);
      }

      // Clear caches
      this.deviceStatusCache.clear();
      this.commandExecutions.clear();

      this.moduleLogger.info('Device integration service shut down successfully');
      this.emit('shutdown');

    } catch (error) {
      this.moduleLogger.error('Error during device integration service shutdown', { error });
      throw error;
    }
  }

  /**
   * Get device status with caching and real-time refresh
   */
  async getDeviceStatus(deviceId: string, userId: string, forceRefresh = false): Promise<DeviceStatusUpdate> {
    try {
      // Get device from database
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        throw createError.notFound(`Device not found: ${deviceId}`);
      }

      const cacheKey = `device_status:${device.deviceId}`;
      
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = this.getCachedData(cacheKey, this.CACHE_TTLS.device_status);
        if (cached) {
          this.moduleLogger.debug('Returning cached device status', { deviceId, source: 'cache' });
          return cached;
        }
      }

      // Get fresh status from protocol adapter
      let freshStatus: DeviceStatusUpdate;
      
      try {
        freshStatus = await this.protocolManager.getDeviceStatus(
          device.protocol as ProtocolType, 
          device.deviceId
        );
        
        // Cache the fresh status
        this.setCachedData(cacheKey, freshStatus, this.CACHE_TTLS.device_status);
        
        // Update device in database if status changed
        await this.updateDeviceFromStatus(device, freshStatus);
        
        deviceLogger.statusUpdate(deviceId, freshStatus.status, 'integration_service');
        
      } catch (protocolError) {
        this.moduleLogger.warn('Failed to get fresh device status, using database fallback', {
          deviceId,
          protocol: device.protocol,
          error: protocolError
        });

        // Fallback to database status
        freshStatus = {
          deviceId: device.deviceId,
          status: device.isOnline ? 'online' : 'offline',
          state: device.currentState,
          timestamp: device.lastSeenAt || new Date(),
          source: 'database_fallback' as any
        };

        // Mark device as potentially offline if we can't reach it
        if (device.isOnline) {
          await this.deviceService.updateById(deviceId, {
            $set: {
              isOnline: false,
              status: 'offline',
              updatedAt: new Date()
            }
          });
        }
      }

      return freshStatus;

    } catch (error) {
      this.moduleLogger.error('Failed to get device status', { deviceId, userId, error });
      throw error;
    }
  }

  /**
   * Execute device command with retry logic and real-time feedback
   */
  async executeDeviceCommand(
    deviceId: string, 
    userId: string, 
    command: string, 
    parameters: Record<string, any> = {}
  ): Promise<CommandResult> {
    const executionId = `${deviceId}-${command}-${Date.now()}`;
    const startTime = Date.now();

    try {
      // Get device from database
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        throw createError.notFound(`Device not found: ${deviceId}`);
      }

      // Validate device is online
      if (!device.isOnline) {
        throw createError.serviceUnavailable(`Device ${device.name} is offline`);
      }

      // Create command object
      const deviceCommand: DeviceCommand = {
        deviceId: device.deviceId,
        command,
        parameters,
        timestamp: new Date()
      };

      // Track command execution
      this.commandExecutions.set(executionId, {
        command: deviceCommand,
        startTime,
        retryCount: 0
      });

      // Execute command with retry logic
      const result = await this.executeCommandWithRetry(device, deviceCommand, executionId);

      // Update device state if command was successful
      if (result.success && result.result) {
        await this.handleCommandSuccess(device, deviceCommand, result);
      }

      // Clean up execution tracking
      this.commandExecutions.delete(executionId);

      // Log command execution
      const duration = Date.now() - startTime;
      deviceLogger.command(deviceId, command, result.success, duration);

      this.moduleLogger.info('Device command executed', {
        deviceId,
        command,
        success: result.success,
        duration,
        retryCount: result.retryCount || 0
      });

      return result;

    } catch (error) {
      // Clean up execution tracking
      this.commandExecutions.delete(executionId);

      const duration = Date.now() - startTime;
      deviceLogger.error(deviceId, command, error instanceof Error ? error.message : 'Unknown error');

      this.moduleLogger.error('Device command failed', {
        deviceId,
        command,
        parameters,
        duration,
        error
      });

      // Return failed command result
      return {
        success: false,
        timestamp: new Date(),
        responseTime: duration,
        error: error instanceof Error ? error.message : 'Command execution failed',
        retryCount: this.commandExecutions.get(executionId)?.retryCount || 0
      };
    }
  }

  /**
   * Discover devices across protocols with caching
   */
  async discoverDevices(
    userId: string, 
    protocol?: ProtocolType, 
    filters?: Record<string, any>
  ): Promise<DeviceDiscovery[]> {
    try {
      const cacheKey = `discovery:${protocol || 'all'}:${JSON.stringify(filters || {})}`;
      
      // Check cache first
      const cached = this.getCachedData(cacheKey, this.CACHE_TTLS.discovery_results);
      if (cached) {
        this.moduleLogger.debug('Returning cached discovery results', { protocol, cacheKey });
        return cached;
      }

      // Run discovery
      const discoveredDevices = await this.protocolManager.discoverDevices(protocol, filters);

      // Filter out devices that user already has
      const userDevices = await this.deviceService.findMany({ userId });
      const existingDeviceIds = new Set(userDevices.map(d => d.deviceId));
      
      const newDevices = discoveredDevices.filter(device => 
        !existingDeviceIds.has(device.deviceId)
      );

      // Cache results
      this.setCachedData(cacheKey, newDevices, this.CACHE_TTLS.discovery_results);

      // Emit discovery event for background processing
      this.emit('devicesDiscovered', {
        userId,
        protocol,
        devices: newDevices,
        total: discoveredDevices.length
      });

      deviceLogger.discovery(protocol || 'all', newDevices.length);

      return newDevices;

    } catch (error) {
      this.moduleLogger.error('Device discovery failed', { userId, protocol, filters, error });
      throw error;
    }
  }

  /**
   * Add device with comprehensive validation and setup
   */
  async addDevice(userId: string, deviceData: any): Promise<Device> {
    try {
      // Check if device already exists
      const existingDevice = await this.deviceService.findOne({
        userId,
        deviceId: deviceData.deviceId
      });
      
      if (existingDevice) {
        throw createError.conflict(`Device with ID '${deviceData.deviceId}' already exists`);
      }

      // Test device connection
      const connectionTest = await this.testDeviceConnection(deviceData.protocol, deviceData.deviceId);

      // Create device object
      const device = await this.createDeviceFromData(userId, deviceData, connectionTest);

      // Save device to database
      const createdDevice = await this.deviceService.create(device);
      if (!createdDevice) {
        throw createError.internal('Failed to create device in database');
      }

      // Initialize device monitoring if connected
      if (connectionTest.connected) {
        await this.initializeDeviceMonitoring(createdDevice);
      }

      // Send WebSocket notification
      this.wsManager.sendNotificationToUser(userId, {
        type: 'device_added',
        title: 'Device Added',
        message: `${device.name} has been added to your account`,
        data: { deviceId: device._id, deviceName: device.name }
      });

      this.moduleLogger.info('Device added successfully', {
        userId,
        deviceId: device._id,
        externalDeviceId: deviceData.deviceId,
        connected: connectionTest.connected
      });

      return createdDevice;

    } catch (error) {
      this.moduleLogger.error('Failed to add device', { userId, deviceData, error });
      throw error;
    }
  }

  /**
   * Update device configuration
   */
  async updateDevice(deviceId: string, userId: string, updateData: Partial<Device>): Promise<Device> {
    try {
      // Get existing device
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        throw createError.notFound(`Device not found: ${deviceId}`);
      }

      // Validate update data
      const validatedData = this.validateDeviceUpdateData(updateData);

      // Update device in database
      const updatedDevice = await this.deviceService.updateById(deviceId, {
        $set: {
          ...validatedData,
          updatedAt: new Date()
        }
      });

      if (!updatedDevice) {
        throw createError.internal('Failed to update device');
      }

      // Clear relevant caches
      this.invalidateDeviceCaches(device.deviceId);

      // Send WebSocket notification
      this.wsManager.sendNotificationToUser(userId, {
        type: 'device_updated',
        title: 'Device Updated',
        message: `${device.name} configuration has been updated`,
        data: { deviceId, changes: Object.keys(validatedData) }
      });

      this.moduleLogger.info('Device updated successfully', {
        userId,
        deviceId,
        updateFields: Object.keys(validatedData)
      });

      return updatedDevice;

    } catch (error) {
      this.moduleLogger.error('Failed to update device', { deviceId, userId, updateData, error });
      throw error;
    }
  }

  /**
   * Remove device with cleanup
   */
  async removeDevice(deviceId: string, userId: string): Promise<void> {
    try {
      // Get device
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        throw createError.notFound(`Device not found: ${deviceId}`);
      }

      // Stop device monitoring
      await this.stopDeviceMonitoring(device);

      // Remove device from database
      const deleted = await this.deviceService.deleteById(deviceId);
      if (!deleted) {
        throw createError.internal('Failed to delete device from database');
      }

      // Clear caches
      this.invalidateDeviceCaches(device.deviceId);

      // Send WebSocket notification
      this.wsManager.sendNotificationToUser(userId, {
        type: 'device_removed',
        title: 'Device Removed',
        message: `${device.name} has been removed from your account`,
        data: { deviceId, deviceName: device.name }
      });

      this.moduleLogger.info('Device removed successfully', {
        userId,
        deviceId,
        deviceName: device.name
      });

    } catch (error) {
      this.moduleLogger.error('Failed to remove device', { deviceId, userId, error });
      throw error;
    }
  }

  /**
   * Get device diagnostics
   */
  async getDeviceDiagnostics(deviceId: string, userId: string): Promise<Record<string, any>> {
    try {
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        throw createError.notFound(`Device not found: ${deviceId}`);
      }

      // Get protocol adapter diagnostics
      const adapter = this.protocolManager.getAdapter(device.protocol as ProtocolType);
      const protocolDiagnostics = adapter ? await adapter.getDiagnostics() : null;

      // Get device-specific diagnostics
      const diagnostics = {
        device: {
          id: deviceId,
          externalId: device.deviceId,
          name: device.name,
          protocol: device.protocol,
          deviceType: device.deviceType,
          isOnline: device.isOnline,
          lastSeen: device.lastSeenAt,
          lastCommand: device.lastCommandAt,
          currentState: device.currentState
        },
        protocol: protocolDiagnostics,
        connection: {
          adapter: adapter?.isConnected() || false,
          lastTest: await this.testDeviceConnection(device.protocol as ProtocolType, device.deviceId)
        },
        cache: {
          statusCached: this.deviceStatusCache.has(`device_status:${device.deviceId}`),
          cacheEntries: Array.from(this.deviceStatusCache.keys()).filter(key => 
            key.includes(device.deviceId)
          )
        },
        monitoring: {
          activeSubscriptions: adapter?.getActiveSubscriptions().filter(sub => 
            sub.deviceId === device.deviceId
          ) || []
        }
      };

      return diagnostics;

    } catch (error) {
      this.moduleLogger.error('Failed to get device diagnostics', { deviceId, userId, error });
      throw error;
    }
  }

  // Private helper methods

  private setupEventHandlers(): void {
    // Handle protocol adapter events
    this.protocolManager.on('deviceUpdate', (update: DeviceStatusUpdate) => {
      this.handleDeviceStatusUpdate(update);
    });

    this.protocolManager.on('adapterDisconnected', (protocol: ProtocolType, error?: string) => {
      this.handleAdapterDisconnection(protocol, error);
    });
  }

  private setupProtocolAdapterHandlers(): void {
    // Setup handlers for each protocol adapter
    for (const adapter of this.protocolManager.getAdapters()) {
      adapter.on('deviceUpdate', (update: DeviceStatusUpdate) => {
        this.handleDeviceStatusUpdate(update);
      });

      adapter.on('error', (error: Error) => {
        this.moduleLogger.error(`Protocol adapter error: ${adapter.getProtocol()}`, { error });
      });
    }
  }

  private async handleDeviceStatusUpdate(update: DeviceStatusUpdate): Promise<void> {
    try {
      // Update cache
      const cacheKey = `device_status:${update.deviceId}`;
      this.setCachedData(cacheKey, update, this.CACHE_TTLS.device_status);

      // Update database
      const device = await this.deviceService.findOne({ deviceId: update.deviceId });
      if (device) {
        await this.updateDeviceFromStatus(device, update);
      }

      // Broadcast via WebSocket
      this.wsManager.broadcastDeviceUpdate(update);

      this.moduleLogger.debug('Device status update processed', {
        deviceId: update.deviceId,
        status: update.status,
        source: update.source
      });

    } catch (error) {
      this.moduleLogger.error('Failed to handle device status update', { update, error });
    }
  }

  private async handleAdapterDisconnection(protocol: ProtocolType, error?: string): Promise<void> {
    this.moduleLogger.warn(`Protocol adapter disconnected: ${protocol}`, { error });

    // Mark all devices of this protocol as potentially offline
    const devices = await this.deviceService.findMany({ protocol: protocol as string });
    
    for (const device of devices) {
      if (device.isOnline) {
        await this.deviceService.updateById(device._id, {
          $set: {
            isOnline: false,
            status: 'offline',
            updatedAt: new Date()
          }
        });

        // Broadcast offline status
        this.wsManager.broadcastDeviceUpdate({
          deviceId: device.deviceId,
          status: 'offline',
          state: device.currentState,
          timestamp: new Date(),
          source: 'adapter_disconnection' as any
        });
      }
    }
  }

  private async executeCommandWithRetry(
    device: Device, 
    command: DeviceCommand, 
    executionId: string
  ): Promise<CommandResult> {
    const execution = this.commandExecutions.get(executionId);
    if (!execution) {
      throw new Error('Command execution not found');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        // Update retry count
        execution.retryCount = attempt;

        // Calculate delay for retry (exponential backoff)
        if (attempt > 0) {
          const delay = Math.min(
            this.RETRY_CONFIG.baseDelay * Math.pow(this.RETRY_CONFIG.backoffFactor, attempt - 1),
            this.RETRY_CONFIG.maxDelay
          );
          
          this.moduleLogger.debug('Retrying command execution', {
            deviceId: device._id,
            command: command.command,
            attempt,
            delay
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Execute command
        const result = await this.protocolManager.sendDeviceCommand(
          device.protocol as ProtocolType,
          device.deviceId,
          command.command,
          command.parameters
        );

        // Add retry count to result
        result.retryCount = attempt;

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        this.moduleLogger.warn('Command execution attempt failed', {
          deviceId: device._id,
          command: command.command,
          attempt,
          error: lastError.message
        });

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(lastError)) {
          break;
        }
      }
    }

    // All retries failed
    return {
      success: false,
      timestamp: new Date(),
      responseTime: Date.now() - execution.startTime,
      error: lastError?.message || 'Command execution failed after retries',
      retryCount: this.RETRY_CONFIG.maxAttempts
    };
  }

  private isNonRetryableError(error: Error): boolean {
    const nonRetryableMessages = [
      'device not found',
      'invalid command',
      'unauthorized',
      'permission denied'
    ];

    return nonRetryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  private async handleCommandSuccess(
    device: Device, 
    command: DeviceCommand, 
    result: CommandResult
  ): Promise<void> {
    try {
      // Update device state
      const newState = result.result || {};
      if (Object.keys(newState).length > 0) {
        await this.deviceService.updateById(device._id, {
          $set: {
            currentState: { ...device.currentState, ...newState },
            lastCommandAt: new Date(),
            updatedAt: new Date()
          }
        });

        // Invalidate status cache
        this.invalidateDeviceCaches(device.deviceId);

        // Broadcast state update
        this.wsManager.broadcastDeviceUpdate({
          deviceId: device.deviceId,
          status: 'online',
          state: newState,
          timestamp: new Date(),
          source: 'command_response' as any
        });
      }

    } catch (error) {
      this.moduleLogger.error('Failed to handle command success', {
        deviceId: device._id,
        command: command.command,
        error
      });
    }
  }

  private async updateDeviceFromStatus(device: Device, status: DeviceStatusUpdate): Promise<void> {
    try {
      const updates: any = {
        updatedAt: new Date()
      };

      // Update online status
      const isOnline = status.status === 'online';
      if (device.isOnline !== isOnline) {
        updates.isOnline = isOnline;
        updates.status = status.status;
      }

      // Update last seen time
      if (isOnline) {
        updates.lastSeenAt = status.timestamp;
      }

      // Update current state if changed
      if (JSON.stringify(device.currentState) !== JSON.stringify(status.state)) {
        updates.currentState = status.state;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 1) { // More than just updatedAt
        await this.deviceService.updateById(device._id, { $set: updates });
      }

    } catch (error) {
      this.moduleLogger.error('Failed to update device from status', {
        deviceId: device._id,
        status,
        error
      });
    }
  }

  private async testDeviceConnection(protocol: ProtocolType, deviceId: string): Promise<{
    connected: boolean;
    error: string | null;
    responseTime?: number;
  }> {
    try {
      const startTime = Date.now();
      const connected = await this.protocolManager.testDeviceConnection(protocol, deviceId);
      const responseTime = Date.now() - startTime;

      return {
        connected,
        error: connected ? null : 'Device not responding',
        responseTime
      };

    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  private async createDeviceFromData(
    userId: string, 
    deviceData: any, 
    connectionTest: { connected: boolean; error: string | null }
  ): Promise<any> {
    const now = new Date();
    
    return {
      _id: new (require('mongodb')).ObjectId().toHexString(),
      userId,
      deviceId: deviceData.deviceId,
      protocol: deviceData.protocol,
      deviceType: deviceData.deviceType,
      name: deviceData.name,
      description: deviceData.description || '',
      location: deviceData.location || '',
      room: deviceData.room || '',
      floor: deviceData.floor || '',
      building: deviceData.building || '',
      specifications: deviceData.specifications,
      capabilities: this.getDeviceCapabilities(deviceData.deviceType),
      isOnline: connectionTest.connected,
      status: connectionTest.connected ? 'online' : 'offline',
      currentState: {},
      settings: {
        autoControl: false,
        energyOptimization: false,
        maxPowerDraw: deviceData.specifications.maxPower || null,
        alerts: [],
        schedules: []
      },
      metadata: {
        addedBy: userId,
        addedAt: now,
        lastConfigUpdate: now,
        connectionTestResult: connectionTest
      },
      createdAt: now,
      updatedAt: now,
      lastSeenAt: connectionTest.connected ? now : null,
      lastCommandAt: null
    };
  }

  private getDeviceCapabilities(deviceType: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      'smart_plug': ['switch', 'energy_meter', 'scheduler'],
      'solar_inverter': ['energy_generator', 'inverter_stats', 'grid_tie', 'monitoring'],
      'battery_pack': ['battery_monitor', 'charge_controller', 'energy_storage', 'backup_power']
    };
    return capabilityMap[deviceType] || ['basic_control'];
  }

  private validateDeviceUpdateData(updateData: Partial<Device>): Record<string, any> {
    const allowedFields = [
      'name', 'description', 'location', 'room', 'floor', 'building',
      'settings', 'specifications'
    ];

    const validatedData: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        validatedData[key] = value;
      }
    }

    return validatedData;
  }

  private async initializeDeviceMonitoring(device: Device): Promise<void> {
    try {
      await this.protocolManager.subscribeToDeviceUpdates(
        device.deviceId, 
        device.protocol as ProtocolType
      );
      
      this.moduleLogger.info('Device monitoring initialized', {
        deviceId: device._id,
        externalDeviceId: device.deviceId,
        protocol: device.protocol
      });

    } catch (error) {
      this.moduleLogger.warn('Failed to initialize device monitoring', {
        deviceId: device._id,
        error
      });
    }
  }

  private async stopDeviceMonitoring(device: Device): Promise<void> {
    try {
      // Get active subscriptions for this device
      const adapter = this.protocolManager.getAdapter(device.protocol as ProtocolType);
      if (adapter) {
        const subscriptions = adapter.getActiveSubscriptions().filter(sub => 
          sub.deviceId === device.deviceId
        );

        for (const subscription of subscriptions) {
          await adapter.unsubscribeFromUpdates(subscription.subscriptionId);
        }
      }

      this.moduleLogger.info('Device monitoring stopped', {
        deviceId: device._id,
        externalDeviceId: device.deviceId
      });

    } catch (error) {
      this.moduleLogger.warn('Failed to stop device monitoring', {
        deviceId: device._id,
        error
      });
    }
  }

  private async startDeviceMonitoring(): Promise<void> {
    // Start periodic status monitoring for all online devices
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performPeriodicStatusCheck();
      } catch (error) {
        this.moduleLogger.error('Periodic status check failed', { error });
      }
    }, 60000); // Check every minute

    this.moduleLogger.info('Device monitoring started');
  }

  private async performPeriodicStatusCheck(): Promise<void> {
    try {
      // Get all online devices
      const onlineDevices = await this.deviceService.findMany({ 
        isOnline: true 
      });

      // Check status for devices that haven't been seen recently
      const staleThreshold = Date.now() - (5 * 60 * 1000); // 5 minutes
      
      for (const device of onlineDevices) {
        const lastSeen = device.lastSeenAt?.getTime() || 0;
        
        if (lastSeen < staleThreshold) {
          try {
            await this.getDeviceStatus(device._id, device.userId, true);
          } catch (error) {
            this.moduleLogger.debug('Periodic status check failed for device', {
              deviceId: device._id,
              error: error instanceof Error ? error.message : error
            });
          }
        }
      }

    } catch (error) {
      this.moduleLogger.error('Periodic status check failed', { error });
    }
  }

  private getCachedData<T>(key: string, ttl: number): T | null {
    const cached = this.deviceStatusCache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > ttl) {
      this.deviceStatusCache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private setCachedData<T>(key: string, data: T, ttl: number): void {
    this.deviceStatusCache.set(key, {
      data: data as any,
      timestamp: Date.now(),
      ttl
    });

    // Cleanup old cache entries periodically
    if (this.deviceStatusCache.size > 1000) {
      this.cleanupCache();
    }
  }

  private invalidateDeviceCaches(deviceId: string): void {
    const keysToDelete = Array.from(this.deviceStatusCache.keys()).filter(key =>
      key.includes(deviceId)
    );

    for (const key of keysToDelete) {
      this.deviceStatusCache.delete(key);
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, cached] of this.deviceStatusCache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.deviceStatusCache.delete(key);
    }

    this.moduleLogger.debug('Cache cleanup completed', {
      deletedEntries: keysToDelete.length,
      remainingEntries: this.deviceStatusCache.size
    });
  }

  /**
   * Get service health and statistics
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    try {
      const cacheStats = {
        entries: this.deviceStatusCache.size,
        memory: process.memoryUsage()
      };

      const executionStats = {
        activeCommands: this.commandExecutions.size,
        protocolAdapters: this.protocolManager.getAdapterStatus()
      };

      return {
        status: 'healthy',
        details: {
          initialized: true,
          cache: cacheStats,
          execution: executionStats,
          monitoring: {
            active: !!this.monitoringInterval
          }
        }
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

export default DeviceIntegrationService;