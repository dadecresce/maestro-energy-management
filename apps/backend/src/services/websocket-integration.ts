import { Socket } from 'socket.io';
import { 
  DeviceStatusUpdate, 
  DeviceCommand, 
  ProtocolType 
} from '@maestro/shared/types';

import { DeviceIntegrationService } from '@/services/device-integration';
import { DeviceService } from '@/services/database/DeviceService';
import { WebSocketManager } from '@/services/websocket';
import { createError } from '@/utils/errors';
import logger, { createModuleLogger } from '@/config/logger';

/**
 * WebSocket Integration Service
 * 
 * Extends the base WebSocket manager with device-specific functionality
 * for real-time device control and monitoring.
 * 
 * Features:
 * - Real-time device command execution
 * - Live device status streaming
 * - Device discovery notifications
 * - Connection quality monitoring
 * - Bulk device operations
 */
export class WebSocketIntegrationService {
  private moduleLogger = createModuleLogger('WebSocketIntegrationService');
  private activeDeviceStreams: Map<string, Set<string>> = new Map(); // deviceId -> Set of socketIds
  private commandQueue: Map<string, Array<{ command: DeviceCommand; socketId: string; timestamp: number }>> = new Map();

  constructor(
    private wsManager: WebSocketManager,
    private deviceIntegration: DeviceIntegrationService,
    private deviceService: DeviceService
  ) {
    this.moduleLogger.info('WebSocket integration service initialized');
    this.setupDeviceEventHandlers();
  }

  /**
   * Initialize enhanced WebSocket handlers for device operations
   */
  initialize(): void {
    try {
      this.moduleLogger.info('Setting up enhanced WebSocket device handlers...');

      // Override default WebSocket handlers with device-specific ones
      this.setupEnhancedSocketHandlers();

      this.moduleLogger.info('Enhanced WebSocket device handlers setup completed');

    } catch (error) {
      this.moduleLogger.error('Failed to initialize WebSocket integration', { error });
      throw createError.internal('WebSocket integration initialization failed', { originalError: error });
    }
  }

  /**
   * Setup enhanced socket event handlers for device operations
   */
  private setupEnhancedSocketHandlers(): void {
    // We'll extend the existing WebSocket manager by adding our handlers
    const originalSetupSocketEventHandlers = (this.wsManager as any).setupSocketEventHandlers;
    
    (this.wsManager as any).setupSocketEventHandlers = (socket: Socket) => {
      // Call original handlers first
      originalSetupSocketEventHandlers.call(this.wsManager, socket);
      
      // Add our enhanced device handlers
      this.addDeviceSpecificHandlers(socket);
    };
  }

  /**
   * Add device-specific event handlers to a socket
   */
  private addDeviceSpecificHandlers(socket: Socket): void {
    const userId = socket.userId;
    const socketId = socket.id;

    // Enhanced device subscription with real-time streaming
    socket.on('device:subscribe:stream', async (data: { deviceId: string; streamTypes: string[] }) => {
      await this.handleDeviceStreamSubscription(socket, data.deviceId, data.streamTypes);
    });

    // Enhanced device unsubscription
    socket.on('device:unsubscribe:stream', (data: { deviceId: string }) => {
      this.handleDeviceStreamUnsubscription(socket, data.deviceId);
    });

    // Real-time device command execution
    socket.on('device:command:execute', async (data: {
      deviceId: string;
      command: string;
      parameters?: Record<string, any>;
      priority?: 'low' | 'normal' | 'high';
    }) => {
      await this.handleRealtimeDeviceCommand(socket, data);
    });

    // Bulk device commands
    socket.on('devices:command:bulk', async (data: {
      deviceIds: string[];
      command: string;
      parameters?: Record<string, any>;
    }) => {
      await this.handleBulkDeviceCommand(socket, data);
    });

    // Device status request with options
    socket.on('device:status:get', async (data: {
      deviceId: string;
      forceRefresh?: boolean;
      includeHistory?: boolean;
    }) => {
      await this.handleEnhancedDeviceStatusRequest(socket, data);
    });

    // Device discovery with filters
    socket.on('devices:discover', async (data: {
      protocol?: ProtocolType;
      filters?: Record<string, any>;
      timeout?: number;
    }) => {
      await this.handleDeviceDiscovery(socket, data);
    });

    // Device connection test
    socket.on('device:test:connection', async (data: { deviceId: string }) => {
      await this.handleDeviceConnectionTest(socket, data.deviceId);
    });

    // Get device diagnostics
    socket.on('device:diagnostics:get', async (data: { deviceId: string }) => {
      await this.handleDeviceDiagnosticsRequest(socket, data.deviceId);
    });

    // Subscribe to discovery events
    socket.on('devices:discovery:subscribe', () => {
      socket.join('discovery_updates');
      socket.emit('devices:discovery:subscribed', {
        timestamp: new Date().toISOString()
      });
    });

    // Handle socket disconnect cleanup
    socket.on('disconnect', () => {
      this.handleSocketDisconnect(socketId);
    });

    this.moduleLogger.debug('Enhanced device handlers added to socket', {
      socketId,
      userId
    });
  }

  /**
   * Handle device stream subscription for real-time updates
   */
  private async handleDeviceStreamSubscription(
    socket: Socket, 
    deviceId: string, 
    streamTypes: string[]
  ): Promise<void> {
    try {
      const userId = socket.userId;
      const socketId = socket.id;

      // Verify user has access to device
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        socket.emit('device:stream:error', {
          deviceId,
          error: 'Device not found or access denied',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Add socket to device stream tracking
      if (!this.activeDeviceStreams.has(deviceId)) {
        this.activeDeviceStreams.set(deviceId, new Set());
      }
      this.activeDeviceStreams.get(deviceId)!.add(socketId);

      // Join device-specific room
      socket.join(`device:stream:${deviceId}`);

      // Start streaming current status
      try {
        const currentStatus = await this.deviceIntegration.getDeviceStatus(deviceId, userId);
        socket.emit('device:stream:status', {
          deviceId,
          status: currentStatus,
          streamTypes,
          timestamp: new Date().toISOString()
        });
      } catch (statusError) {
        this.moduleLogger.warn('Failed to get initial device status for stream', {
          deviceId,
          error: statusError
        });
      }

      socket.emit('device:stream:subscribed', {
        deviceId,
        streamTypes,
        timestamp: new Date().toISOString()
      });

      this.moduleLogger.debug('Device stream subscription established', {
        socketId,
        userId,
        deviceId,
        streamTypes
      });

    } catch (error) {
      this.moduleLogger.error('Failed to handle device stream subscription', {
        deviceId,
        streamTypes,
        error
      });

      socket.emit('device:stream:error', {
        deviceId,
        error: 'Failed to establish device stream',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle device stream unsubscription
   */
  private handleDeviceStreamUnsubscription(socket: Socket, deviceId: string): void {
    const socketId = socket.id;

    // Remove from stream tracking
    const streamSockets = this.activeDeviceStreams.get(deviceId);
    if (streamSockets) {
      streamSockets.delete(socketId);
      if (streamSockets.size === 0) {
        this.activeDeviceStreams.delete(deviceId);
      }
    }

    // Leave device room
    socket.leave(`device:stream:${deviceId}`);

    socket.emit('device:stream:unsubscribed', {
      deviceId,
      timestamp: new Date().toISOString()
    });

    this.moduleLogger.debug('Device stream unsubscription completed', {
      socketId,
      deviceId
    });
  }

  /**
   * Handle real-time device command execution
   */
  private async handleRealtimeDeviceCommand(socket: Socket, data: {
    deviceId: string;
    command: string;
    parameters?: Record<string, any>;
    priority?: 'low' | 'normal' | 'high';
  }): Promise<void> {
    try {
      const userId = socket.userId;
      const { deviceId, command, parameters = {}, priority = 'normal' } = data;
      const startTime = Date.now();

      this.moduleLogger.info('Real-time device command received', {
        socketId: socket.id,
        userId,
        deviceId,
        command,
        priority
      });

      // Send immediate acknowledgment
      socket.emit('device:command:acknowledged', {
        deviceId,
        command,
        timestamp: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 5000).toISOString()
      });

      // Execute command
      const result = await this.deviceIntegration.executeDeviceCommand(
        deviceId,
        userId,
        command,
        parameters
      );

      const duration = Date.now() - startTime;

      // Send command result
      socket.emit('device:command:result', {
        deviceId,
        command,
        parameters,
        result: {
          success: result.success,
          data: result.result,
          error: result.error,
          responseTime: duration,
          retryCount: result.retryCount || 0
        },
        timestamp: new Date().toISOString()
      });

      // Broadcast status update to all device stream subscribers
      if (result.success && result.result) {
        this.broadcastToDeviceStreams(deviceId, {
          type: 'command_executed',
          command,
          newState: result.result,
          timestamp: new Date().toISOString()
        });
      }

      this.moduleLogger.info('Real-time device command completed', {
        userId,
        deviceId,
        command,
        success: result.success,
        duration
      });

    } catch (error) {
      this.moduleLogger.error('Real-time device command failed', {
        userId: socket.userId,
        deviceId: data.deviceId,
        command: data.command,
        error
      });

      socket.emit('device:command:error', {
        deviceId: data.deviceId,
        command: data.command,
        error: error instanceof Error ? error.message : 'Command execution failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle bulk device command execution
   */
  private async handleBulkDeviceCommand(socket: Socket, data: {
    deviceIds: string[];
    command: string;
    parameters?: Record<string, any>;
  }): Promise<void> {
    try {
      const userId = socket.userId;
      const { deviceIds, command, parameters = {} } = data;

      this.moduleLogger.info('Bulk device command received', {
        socketId: socket.id,
        userId,
        deviceCount: deviceIds.length,
        command
      });

      // Send acknowledgment with progress tracking
      socket.emit('devices:command:bulk:started', {
        deviceIds,
        command,
        totalDevices: deviceIds.length,
        timestamp: new Date().toISOString()
      });

      // Execute commands in parallel with progress updates
      const results = await Promise.allSettled(
        deviceIds.map(async (deviceId, index) => {
          try {
            const result = await this.deviceIntegration.executeDeviceCommand(
              deviceId,
              userId,
              command,
              parameters
            );

            // Send progress update
            socket.emit('devices:command:bulk:progress', {
              deviceId,
              command,
              result: {
                success: result.success,
                error: result.error
              },
              progress: {
                completed: index + 1,
                total: deviceIds.length,
                percentage: Math.round(((index + 1) / deviceIds.length) * 100)
              },
              timestamp: new Date().toISOString()
            });

            return { deviceId, result };

          } catch (error) {
            socket.emit('devices:command:bulk:progress', {
              deviceId,
              command,
              result: {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              },
              progress: {
                completed: index + 1,
                total: deviceIds.length,
                percentage: Math.round(((index + 1) / deviceIds.length) * 100)
              },
              timestamp: new Date().toISOString()
            });

            return { deviceId, result: { success: false, error: error instanceof Error ? error.message : 'Unknown error' } };
          }
        })
      );

      // Send final results summary
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.result.success).length;
      const failureCount = deviceIds.length - successCount;

      socket.emit('devices:command:bulk:completed', {
        command,
        summary: {
          total: deviceIds.length,
          successful: successCount,
          failed: failureCount,
          successRate: Math.round((successCount / deviceIds.length) * 100)
        },
        results: results.map(r => r.status === 'fulfilled' ? r.value : { deviceId: 'unknown', result: { success: false, error: 'Promise rejected' } }),
        timestamp: new Date().toISOString()
      });

      this.moduleLogger.info('Bulk device command completed', {
        userId,
        deviceCount: deviceIds.length,
        command,
        successCount,
        failureCount
      });

    } catch (error) {
      this.moduleLogger.error('Bulk device command failed', {
        userId: socket.userId,
        deviceIds: data.deviceIds,
        command: data.command,
        error
      });

      socket.emit('devices:command:bulk:error', {
        command: data.command,
        error: error instanceof Error ? error.message : 'Bulk command execution failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle enhanced device status request
   */
  private async handleEnhancedDeviceStatusRequest(socket: Socket, data: {
    deviceId: string;
    forceRefresh?: boolean;
    includeHistory?: boolean;
  }): Promise<void> {
    try {
      const userId = socket.userId;
      const { deviceId, forceRefresh = false, includeHistory = false } = data;

      // Get device status
      const status = await this.deviceIntegration.getDeviceStatus(deviceId, userId, forceRefresh);

      const response: any = {
        deviceId,
        status,
        timestamp: new Date().toISOString()
      };

      // Include device history if requested
      if (includeHistory) {
        // TODO: Implement device history retrieval
        response.history = {
          recentCommands: [],
          statusHistory: [],
          note: 'History feature not yet implemented'
        };
      }

      // Include diagnostics information
      const diagnostics = await this.deviceIntegration.getDeviceDiagnostics(deviceId, userId);
      response.diagnostics = {
        connectionQuality: diagnostics.connection.lastTest.connected ? 'excellent' : 'poor',
        protocolStatus: diagnostics.protocol?.connected || false,
        cacheStatus: diagnostics.cache
      };

      socket.emit('device:status:response', response);

      this.moduleLogger.debug('Enhanced device status sent', {
        socketId: socket.id,
        userId,
        deviceId,
        forceRefresh,
        includeHistory
      });

    } catch (error) {
      this.moduleLogger.error('Enhanced device status request failed', {
        userId: socket.userId,
        deviceId: data.deviceId,
        error
      });

      socket.emit('device:status:error', {
        deviceId: data.deviceId,
        error: error instanceof Error ? error.message : 'Failed to get device status',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle device discovery via WebSocket
   */
  private async handleDeviceDiscovery(socket: Socket, data: {
    protocol?: ProtocolType;
    filters?: Record<string, any>;
    timeout?: number;
  }): Promise<void> {
    try {
      const userId = socket.userId;
      const { protocol, filters, timeout = 30000 } = data;

      this.moduleLogger.info('WebSocket device discovery started', {
        socketId: socket.id,
        userId,
        protocol,
        filters,
        timeout
      });

      // Send discovery started event
      socket.emit('devices:discovery:started', {
        protocol,
        filters,
        timeout,
        timestamp: new Date().toISOString()
      });

      // Run discovery with timeout
      const discoveryPromise = this.deviceIntegration.discoverDevices(userId, protocol, filters);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Discovery timeout')), timeout)
      );

      const devices = await Promise.race([discoveryPromise, timeoutPromise]) as any[];

      // Send discovery results
      socket.emit('devices:discovery:completed', {
        protocol,
        devices,
        summary: {
          total: devices.length,
          byProtocol: devices.reduce((acc, device) => {
            acc[device.protocol] = (acc[device.protocol] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        },
        timestamp: new Date().toISOString()
      });

      // Broadcast to discovery subscribers
      this.wsManager.getIO().to('discovery_updates').emit('devices:discovery:broadcast', {
        userId,
        protocol,
        deviceCount: devices.length,
        timestamp: new Date().toISOString()
      });

      this.moduleLogger.info('WebSocket device discovery completed', {
        userId,
        protocol,
        deviceCount: devices.length
      });

    } catch (error) {
      this.moduleLogger.error('WebSocket device discovery failed', {
        userId: socket.userId,
        protocol: data.protocol,
        error
      });

      socket.emit('devices:discovery:error', {
        protocol: data.protocol,
        error: error instanceof Error ? error.message : 'Device discovery failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle device connection test
   */
  private async handleDeviceConnectionTest(socket: Socket, deviceId: string): Promise<void> {
    try {
      const userId = socket.userId;

      // Get device info
      const device = await this.deviceService.findOne({ _id: deviceId, userId });
      if (!device) {
        socket.emit('device:test:error', {
          deviceId,
          error: 'Device not found or access denied',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Send test started event
      socket.emit('device:test:started', {
        deviceId,
        deviceName: device.name,
        protocol: device.protocol,
        timestamp: new Date().toISOString()
      });

      // Run diagnostics
      const diagnostics = await this.deviceIntegration.getDeviceDiagnostics(deviceId, userId);

      // Send test results
      socket.emit('device:test:completed', {
        deviceId,
        results: {
          connection: diagnostics.connection.lastTest,
          protocol: {
            connected: diagnostics.protocol?.connected || false,
            adapter: diagnostics.device.protocol
          },
          device: {
            online: diagnostics.device.isOnline,
            lastSeen: diagnostics.device.lastSeen,
            currentState: diagnostics.device.currentState
          }
        },
        timestamp: new Date().toISOString()
      });

      this.moduleLogger.debug('Device connection test completed', {
        userId,
        deviceId,
        connected: diagnostics.connection.lastTest.connected
      });

    } catch (error) {
      this.moduleLogger.error('Device connection test failed', {
        userId: socket.userId,
        deviceId,
        error
      });

      socket.emit('device:test:error', {
        deviceId,
        error: error instanceof Error ? error.message : 'Connection test failed',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle device diagnostics request
   */
  private async handleDeviceDiagnosticsRequest(socket: Socket, deviceId: string): Promise<void> {
    try {
      const userId = socket.userId;

      const diagnostics = await this.deviceIntegration.getDeviceDiagnostics(deviceId, userId);

      socket.emit('device:diagnostics:response', {
        deviceId,
        diagnostics,
        timestamp: new Date().toISOString()
      });

      this.moduleLogger.debug('Device diagnostics sent', {
        socketId: socket.id,
        userId,
        deviceId
      });

    } catch (error) {
      this.moduleLogger.error('Device diagnostics request failed', {
        userId: socket.userId,
        deviceId,
        error
      });

      socket.emit('device:diagnostics:error', {
        deviceId,
        error: error instanceof Error ? error.message : 'Failed to get device diagnostics',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle socket disconnect cleanup
   */
  private handleSocketDisconnect(socketId: string): void {
    // Clean up device stream subscriptions
    for (const [deviceId, sockets] of this.activeDeviceStreams.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.activeDeviceStreams.delete(deviceId);
      }
    }

    // Clean up command queue
    for (const [deviceId, commands] of this.commandQueue.entries()) {
      const filteredCommands = commands.filter(cmd => cmd.socketId !== socketId);
      if (filteredCommands.length === 0) {
        this.commandQueue.delete(deviceId);
      } else {
        this.commandQueue.set(deviceId, filteredCommands);
      }
    }

    this.moduleLogger.debug('Socket disconnect cleanup completed', { socketId });
  }

  /**
   * Setup device event handlers
   */
  private setupDeviceEventHandlers(): void {
    // Listen for device status updates from the integration service
    this.deviceIntegration.on('deviceUpdate', (update: DeviceStatusUpdate) => {
      this.broadcastToDeviceStreams(update.deviceId, {
        type: 'status_update',
        status: update,
        timestamp: new Date().toISOString()
      });
    });

    // Listen for device discovery events
    this.deviceIntegration.on('devicesDiscovered', (data: any) => {
      this.wsManager.getIO().to('discovery_updates').emit('devices:discovery:broadcast', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Broadcast message to all sockets streaming a specific device
   */
  private broadcastToDeviceStreams(deviceId: string, message: any): void {
    const roomName = `device:stream:${deviceId}`;
    this.wsManager.getIO().to(roomName).emit('device:stream:update', {
      deviceId,
      ...message
    });

    this.moduleLogger.debug('Message broadcasted to device streams', {
      deviceId,
      roomName,
      messageType: message.type
    });
  }

  /**
   * Get WebSocket integration statistics
   */
  getStats(): {
    activeStreams: number;
    devicesWithStreams: number;
    commandQueueSize: number;
  } {
    return {
      activeStreams: Array.from(this.activeDeviceStreams.values()).reduce((sum, sockets) => sum + sockets.size, 0),
      devicesWithStreams: this.activeDeviceStreams.size,
      commandQueueSize: Array.from(this.commandQueue.values()).reduce((sum, commands) => sum + commands.length, 0)
    };
  }

  /**
   * Force disconnect all streams for a device (used when device is removed)
   */
  disconnectDeviceStreams(deviceId: string): void {
    const roomName = `device:stream:${deviceId}`;
    
    // Notify all connected clients that the device stream is ending
    this.wsManager.getIO().to(roomName).emit('device:stream:disconnected', {
      deviceId,
      reason: 'Device removed',
      timestamp: new Date().toISOString()
    });

    // Clean up tracking
    this.activeDeviceStreams.delete(deviceId);
    this.commandQueue.delete(deviceId);

    this.moduleLogger.info('Device streams disconnected', { deviceId });
  }
}

// Add method to WebSocketManager to get IO instance
declare module '@/services/websocket' {
  interface WebSocketManager {
    getIO(): any;
  }
}

export default WebSocketIntegrationService;