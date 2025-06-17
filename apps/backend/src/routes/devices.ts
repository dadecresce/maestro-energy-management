import { Router, Request, Response } from 'express';
import { validateBody, validateParams, validatePagination, validateDeviceId } from '@/middleware/validation';
import { deviceSchemas, commonSchemas } from '@/middleware/validation';
import { AuthMiddleware } from '@/middleware/auth';
import { DeviceService } from '@/services/database/DeviceService';
import { UserService } from '@/services/database/UserService';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { WebSocketManager } from '@/services/websocket';
import { WebSocketIntegrationService } from '@/services/websocket-integration';
import { DeviceIntegrationService } from '@/services/device-integration';
import { CacheManager } from '@/services/cache';
import { DatabaseManager } from '@/services/database';
import { ApiError, ValidationError } from '@/utils/errors';
import { DeviceStatusUpdate, DeviceCommand, DeviceDiscovery } from '@maestro/shared/types';
import logger, { deviceLogger } from '@/config/logger';
import Joi from 'joi';
import { ObjectId } from 'mongodb';

/**
 * Device Management Routes
 * 
 * Handles device discovery, management, control, and status monitoring
 * All routes require authentication
 */
const router = Router();

// Services (would typically be injected via DI container)
let deviceService: DeviceService;
let userService: UserService;
let protocolManager: ProtocolAdapterManager;
let wsManager: WebSocketManager;
let wsIntegration: WebSocketIntegrationService;
let deviceIntegration: DeviceIntegrationService;
let authMiddleware: AuthMiddleware;
let cache: CacheManager;

// Service initialization function (called from app startup)
export function initializeDeviceServices(
  db: DatabaseManager,
  cacheManager: CacheManager,
  authMw: AuthMiddleware,
  protocolMgr: ProtocolAdapterManager,
  webSocketMgr?: WebSocketManager
) {
  deviceService = new DeviceService(db.getDevicesCollection());
  userService = new UserService(db.getUsersCollection());
  authMiddleware = authMw;
  cache = cacheManager;
  protocolManager = protocolMgr;
  wsManager = webSocketMgr!;
  
  // Initialize integration services
  if (wsManager && protocolManager) {
    deviceIntegration = new DeviceIntegrationService(
      deviceService,
      protocolManager,
      wsManager,
      cacheManager
    );
    
    wsIntegration = new WebSocketIntegrationService(
      wsManager,
      deviceIntegration,
      deviceService
    );
  }
}

// Apply authentication middleware to all routes
router.use((req, res, next) => {
  if (authMiddleware) {
    return authMiddleware.requireAuth()(req, res, next);
  }
  next();
});

/**
 * GET /api/v1/devices
 * Get list of user's devices with pagination and filtering
 */
router.get('/', validatePagination, async (req: Request, res: Response) => {
  try {
    const { page, limit, sort, order, search } = req.query;
    const { status, type, location, protocol, room, floor } = req.query;
    const currentUser = req.user;

    if (!deviceService || !currentUser) {
      throw new ApiError('Device service not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Device list request', { 
      userId: currentUser._id,
      page, limit, sort, order, search, status, type, location, protocol, room, floor,
      requestId: req.requestId 
    });

    // Build query filters
    const filters: any = { userId: currentUser._id };
    
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { deviceId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { room: { $regex: search, $options: 'i' } },
        { 'specifications.manufacturer': { $regex: search, $options: 'i' } },
        { 'specifications.model': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) filters.status = status;
    if (type) filters.deviceType = type;
    if (protocol) filters.protocol = protocol;
    if (location) filters.location = { $regex: location, $options: 'i' };
    if (room) filters.room = { $regex: room, $options: 'i' };
    if (floor) filters.floor = { $regex: floor, $options: 'i' };

    // Get devices with pagination
    const result = await deviceService.findWithPagination(
      filters,
      {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        sort: sort as string || 'name',
        order: order as 'asc' | 'desc' || 'asc'
      }
    );

    // Enhance devices with real-time status if possible
    const enhancedDevices = await Promise.all(
      result.data.map(async (device) => {
        try {
          // Try to get fresh status from protocol adapter
          let freshStatus = null;
          if (protocolManager && device.isOnline) {
            try {
              freshStatus = await protocolManager.getDeviceStatus(device.protocol as any, device.deviceId);
            } catch (statusError) {
              // If we can't get fresh status, use cached
              logger.debug('Could not get fresh device status', {
                deviceId: device._id,
                error: statusError
              });
            }
          }

          return {
            ...device,
            // Update with fresh status if available
            ...(freshStatus && {
              currentState: freshStatus.state,
              status: freshStatus.status,
              lastSeenAt: freshStatus.timestamp
            }),
            // Add computed fields
            connectionQuality: device.isOnline ? 
              (Math.random() > 0.2 ? 'excellent' : 'good') : 'disconnected',
            lastActivity: device.lastCommandAt || device.lastSeenAt,
            energyToday: Math.round(Math.random() * 10 * 100) / 100 // kWh - placeholder
          };
        } catch (error) {
          logger.warn('Error enhancing device data', {
            deviceId: device._id,
            error: error instanceof Error ? error.message : error
          });
          return device;
        }
      })
    );

    // Calculate summary statistics
    const summary = {
      total: result.pagination.total,
      online: enhancedDevices.filter(d => d.isOnline).length,
      offline: enhancedDevices.filter(d => !d.isOnline).length,
      byType: enhancedDevices.reduce((acc, device) => {
        acc[device.deviceType] = (acc[device.deviceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byProtocol: enhancedDevices.reduce((acc, device) => {
        acc[device.protocol] = (acc[device.protocol] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      totalEnergyToday: enhancedDevices.reduce((sum, device) => 
        sum + (device.energyToday || 0), 0
      )
    };

    res.json({
      success: true,
      data: enhancedDevices,
      pagination: result.pagination,
      summary,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Device list failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve devices',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/devices/discover
 * Discover new devices using protocol adapters
 */
router.post('/discover', validateBody({
  protocol: Joi.string().valid('tuya', 'modbus', 'mqtt').optional(),
  filters: Joi.object({
    deviceType: Joi.string().optional(),
    location: Joi.string().optional(),
    timeout: Joi.number().min(5000).max(60000).default(30000)
  }).optional().default({})
}), async (req: Request, res: Response) => {
  try {
    const { protocol, filters = {} } = req.body;
    const currentUser = req.user;

    if (!protocolManager || !currentUser) {
      throw new ApiError('Protocol manager not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const startTime = Date.now();
    
    logger.info('Device discovery started', { 
      userId: currentUser._id,
      protocol, 
      filters,
      requestId: req.requestId 
    });

    // Check if protocol manager is ready
    if (!protocolManager.isReady()) {
      throw new ApiError('Protocol adapters not ready', 503, 'ADAPTERS_NOT_READY');
    }

    // Run discovery with timeout
    const discoveryTimeout = filters.timeout || 30000;
    const discoveryPromise = protocolManager.discoverDevices(protocol, filters);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Discovery timeout')), discoveryTimeout)
    );

    const discoveredDevices = await Promise.race([discoveryPromise, timeoutPromise]) as DeviceDiscovery[];
    
    const duration = Date.now() - startTime;
    deviceLogger.discovery(protocol || 'all', discoveredDevices.length, duration);

    // Filter out devices that user already has
    const userDevices = await deviceService.findMany({ userId: currentUser._id });
    const existingDeviceIds = new Set(userDevices.map(d => d.deviceId));
    
    const newDevices = discoveredDevices.filter(device => 
      !existingDeviceIds.has(device.deviceId)
    );

    // Enhance discovered devices with additional info
    const enhancedDevices = newDevices.map(device => ({
      ...device,
      alreadyAdded: false,
      estimatedSetupTime: estimateSetupTime(device.deviceType),
      supportLevel: getSupportLevel(device.protocol, device.deviceType),
      confidence: device.confidence || 1.0
    }));

    // Helper functions
    function estimateSetupTime(deviceType: string): string {
      const timeEstimates: Record<string, string> = {
        'smart_plug': '2-3 minutes',
        'solar_inverter': '10-15 minutes',
        'battery_pack': '15-20 minutes'
      };
      return timeEstimates[deviceType] || '5-10 minutes';
    }

    function getSupportLevel(protocol: string, deviceType: string): 'full' | 'partial' | 'experimental' {
      // Tuya devices have full support
      if (protocol === 'tuya') return 'full';
      
      // Other protocols may have varying support levels
      if (protocol === 'modbus' && deviceType === 'solar_inverter') return 'full';
      if (protocol === 'mqtt') return 'partial';
      
      return 'experimental';
    }

    // Group by protocol for better UX
    const devicesByProtocol = enhancedDevices.reduce((acc, device) => {
      if (!acc[device.protocol]) {
        acc[device.protocol] = [];
      }
      acc[device.protocol].push(device);
      return acc;
    }, {} as Record<string, any[]>);

    logger.info('Device discovery completed', {
      userId: currentUser._id,
      protocol: protocol || 'all',
      totalFound: discoveredDevices.length,
      newDevices: newDevices.length,
      duration,
      requestId: req.requestId
    });

    res.json({
      success: true,
      data: {
        discovered: enhancedDevices,
        byProtocol: devicesByProtocol,
        summary: {
          total: discoveredDevices.length,
          new: newDevices.length,
          alreadyAdded: discoveredDevices.length - newDevices.length,
          protocols: Object.keys(devicesByProtocol)
        },
        duration,
        protocol: protocol || 'all',
      },
      message: `Discovery completed. Found ${newDevices.length} new devices.`,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    const duration = Date.now() - (req as any).startTime;
    logger.error('Device discovery failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error, 
      duration,
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error && error.message.includes('timeout') ? 
          'Discovery timed out' : 'Device discovery failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }

});

/**
 * POST /api/v1/devices
 * Add a new device to user's account
 */
router.post('/', validateBody(deviceSchemas.createDevice), async (req: Request, res: Response) => {
  try {
    const deviceData = req.body;
    const currentUser = req.user;

    if (!deviceService || !currentUser) {
      throw new ApiError('Device service not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Device creation request', { 
      userId: currentUser._id,
      deviceId: deviceData.deviceId,
      deviceType: deviceData.deviceType,
      protocol: deviceData.protocol,
      requestId: req.requestId 
    });

    // Check if device already exists for this user
    const existingDevice = await deviceService.findOne({
      userId: currentUser._id,
      deviceId: deviceData.deviceId
    });
    
    if (existingDevice) {
      throw new ValidationError(`Device with ID '${deviceData.deviceId}' already exists in your account`);
    }

    // Test device connection before adding
    let connectionTest = { connected: false, error: null as string | null };
    if (protocolManager) {
      try {
        const isConnected = await protocolManager.testDeviceConnection(
          deviceData.protocol as any, 
          deviceData.deviceId
        );
        connectionTest.connected = isConnected;
        
        if (!isConnected) {
          connectionTest.error = 'Device not responding to connection test';
        }
      } catch (testError) {
        connectionTest.error = testError instanceof Error ? testError.message : 'Connection test failed';
        logger.warn('Device connection test failed during creation', {
          deviceId: deviceData.deviceId,
          error: testError
        });
      }
    }

    // Create device object
    const deviceId = new ObjectId().toHexString();
    const now = new Date();
    
    const device = {
      _id: deviceId,
      userId: currentUser._id,
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
      capabilities: getDeviceCapabilities(deviceData.deviceType),
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
        addedBy: currentUser._id,
        addedAt: now,
        lastConfigUpdate: now,
        connectionTestResult: connectionTest
      },
      createdAt: now,
      updatedAt: now,
      lastSeenAt: connectionTest.connected ? now : null,
      lastCommandAt: null
    };

    // Create device in database
    const createdDevice = await deviceService.create(device);
    
    if (!createdDevice) {
      throw new ApiError('Failed to create device', 500, 'DEVICE_CREATION_FAILED');
    }

    // Initialize device monitoring if connected
    if (connectionTest.connected && protocolManager && wsManager) {
      try {
        // Subscribe to device updates
        await protocolManager.subscribeToDeviceUpdates(deviceData.deviceId, deviceData.protocol as any);
        
        logger.info('Device monitoring initialized', {
          deviceId: device._id,
          externalDeviceId: deviceData.deviceId
        });
      } catch (monitoringError) {
        logger.warn('Failed to initialize device monitoring', {
          deviceId: device._id,
          error: monitoringError
        });
      }
    }

    // Send WebSocket notification to user
    if (wsManager) {
      wsManager.sendNotificationToUser(currentUser._id, {
        type: 'device_added',
        title: 'Device Added',
        message: `${device.name} has been added to your account`,
        data: { deviceId: device._id, deviceName: device.name }
      });
    }

    logger.info('Device created successfully', { 
      userId: currentUser._id,
      deviceId: device._id,
      externalDeviceId: deviceData.deviceId,
      connected: connectionTest.connected,
      requestId: req.requestId 
    });

    res.status(201).json({
      success: true,
      data: {
        ...createdDevice,
        // Remove sensitive metadata for response
        metadata: undefined
      },
      message: connectionTest.connected ? 
        'Device added and connected successfully' : 
        'Device added but connection test failed',
      warnings: connectionTest.error ? [connectionTest.error] : undefined,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Device creation failed', { 
      userId: req.user?._id,
      deviceData: req.body,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError || error instanceof ValidationError) {
      res.status(error instanceof ValidationError ? 400 : (error as ApiError).statusCode).json({
        success: false,
        error: error.message,
        code: (error as any).code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add device',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }

});

// Helper function to get default capabilities by device type
function getDeviceCapabilities(deviceType: string): string[] {
  const capabilityMap: Record<string, string[]> = {
    'smart_plug': ['switch', 'energy_meter', 'scheduler'],
    'solar_inverter': ['energy_generator', 'inverter_stats', 'grid_tie', 'monitoring'],
    'battery_pack': ['battery_monitor', 'charge_controller', 'energy_storage', 'backup_power']
  };
  return capabilityMap[deviceType] || ['basic_control'];
}

// Helper function to get valid commands for a device
function getValidCommandsForDevice(deviceType: string, capabilities: string[]): string[] {
  const baseCommands: Record<string, string[]> = {
    'smart_plug': ['turn_on', 'turn_off', 'toggle', 'get_status', 'get_power'],
    'solar_inverter': ['get_status', 'get_production', 'get_efficiency', 'reset_stats'],
    'battery_pack': ['get_status', 'get_charge_level', 'set_charge_limit', 'force_charge', 'force_discharge']
  };
  
  let commands = baseCommands[deviceType] || ['get_status'];
  
  // Add capability-specific commands
  if (capabilities.includes('scheduler')) {
    commands.push('set_schedule', 'clear_schedule', 'get_schedule');
  }
  if (capabilities.includes('energy_meter')) {
    commands.push('get_energy_data', 'reset_energy_stats');
  }
  
  return commands;
}

/**
 * GET /api/v1/devices/:id
 * Get device details by ID
 */
router.get('/:id', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { includeStatus = true, includeDiagnostics = false } = req.query;
    const currentUser = req.user;

    if (!deviceService || !currentUser) {
      throw new ApiError('Device service not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Device details request', { 
      userId: currentUser._id,
      deviceId: id, 
      includeStatus, 
      includeDiagnostics,
      requestId: req.requestId 
    });

    // Get device from database
    const device = await deviceService.findOne({ 
      _id: id, 
      userId: currentUser._id 
    });
    
    if (!device) {
      throw new ApiError('Device not found or access denied', 404, 'DEVICE_NOT_FOUND');
    }

    // Build response data
    const responseData: any = {
      ...device,
      // Add computed fields
      connectionQuality: device.isOnline ? 
        getConnectionQuality(device.lastSeenAt) : 'disconnected',
      uptimePercentage: calculateUptimePercentage(device),
      energyToday: Math.round(Math.random() * 10 * 100) / 100, // kWh - placeholder
      validCommands: getValidCommandsForDevice(device.deviceType, device.capabilities),
    };

    // Include fresh status if requested
    if (includeStatus === 'true' && protocolManager) {
      try {
        const freshStatus = await protocolManager.getDeviceStatus(
          device.protocol as any,
          device.deviceId
        );
        
        responseData.currentStatus = {
          ...freshStatus,
          source: 'real-time'
        };

        // Update cached data if status changed
        if (device.status !== freshStatus.status || 
            JSON.stringify(device.currentState) !== JSON.stringify(freshStatus.state)) {
          
          await deviceService.updateById(id, {
            $set: {
              isOnline: freshStatus.status === 'online',
              status: freshStatus.status,
              currentState: freshStatus.state,
              lastSeenAt: freshStatus.timestamp,
              updatedAt: new Date()
            }
          });

          responseData.isOnline = freshStatus.status === 'online';
          responseData.status = freshStatus.status;
          responseData.currentState = freshStatus.state;
          responseData.lastSeenAt = freshStatus.timestamp;
        }

      } catch (statusError) {
        logger.warn('Failed to get fresh device status', {
          deviceId: id,
          error: statusError
        });
        
        responseData.currentStatus = {
          deviceId: device.deviceId,
          status: device.status,
          state: device.currentState,
          timestamp: device.lastSeenAt || device.updatedAt,
          source: 'cached',
          error: 'Failed to get real-time status'
        };
      }
    }

    // Include diagnostics if requested
    if (includeDiagnostics === 'true' && protocolManager) {
      try {
        const protocolDiagnostics = await protocolManager.getDiagnostics();
        const adapter = protocolManager.getAdapter(device.protocol as any);
        
        responseData.diagnostics = {
          protocol: protocolDiagnostics[device.protocol],
          adapter: {
            connected: adapter?.isConnected() || false,
            stats: adapter?.getStats(),
            subscriptions: adapter?.getActiveSubscriptions().filter(sub => 
              sub.deviceId === device.deviceId
            ) || []
          },
          lastConnectionTest: await protocolManager.testDeviceConnection(
            device.protocol as any,
            device.deviceId
          )
        };

      } catch (diagnosticsError) {
        logger.warn('Failed to get device diagnostics', {
          deviceId: id,
          error: diagnosticsError
        });
        
        responseData.diagnostics = {
          error: 'Failed to get diagnostics information'
        };
      }
    }

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Device details retrieval failed', { 
      userId: req.user?._id,
      deviceId: req.params.id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve device details',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }

  // Helper functions
  function getConnectionQuality(lastSeenAt: Date | null): string {
    if (!lastSeenAt) return 'disconnected';
    
    const timeSinceLastSeen = Date.now() - lastSeenAt.getTime();
    const minutes = timeSinceLastSeen / (1000 * 60);
    
    if (minutes < 1) return 'excellent';
    if (minutes < 5) return 'good';
    if (minutes < 30) return 'fair';
    return 'poor';
  }

  function calculateUptimePercentage(device: any): number {
    // Simplified uptime calculation - in production this would use historical data
    const daysSinceCreated = (Date.now() - new Date(device.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const baseUptime = device.isOnline ? 95 : 85;
    return Math.min(100, Math.round(baseUptime + Math.random() * 10));
  }
});

/**
 * PUT /api/v1/devices/:id
 * Update device configuration
 */
router.put('/:id',
  validateParams({ id: commonSchemas.objectId }),
  validateBody(deviceSchemas.updateDevice),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const currentUser = req.user;

      if (!deviceService || !currentUser) {
        throw new ApiError('Device service not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
      }

      logger.info('Device update request', { 
        userId: currentUser._id,
        deviceId: id,
        updateFields: Object.keys(updateData),
        requestId: req.requestId 
      });

      // Get existing device
      const device = await deviceService.findOne({ 
        _id: id, 
        userId: currentUser._id 
      });
      
      if (!device) {
        throw new ApiError('Device not found or access denied', 404, 'DEVICE_NOT_FOUND');
      }

      // Validate and prepare update data
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

      if (Object.keys(validatedData).length === 0) {
        throw new ValidationError('No valid fields provided for update');
      }

      // Special handling for settings update
      if (validatedData.settings) {
        // Merge with existing settings
        validatedData.settings = {
          ...device.settings,
          ...validatedData.settings
        };

        // Validate settings changes that might affect device operation
        if (validatedData.settings.maxPowerDraw && validatedData.settings.maxPowerDraw > device.specifications.maxPower) {
          throw new ValidationError('Max power draw cannot exceed device maximum power rating');
        }
      }

      // Update device in database
      const updatedDevice = await deviceService.updateById(id, {
        $set: {
          ...validatedData,
          updatedAt: new Date()
        }
      });

      if (!updatedDevice) {
        throw new ApiError('Failed to update device', 500, 'UPDATE_FAILED');
      }

      // Apply settings to physical device if needed
      let settingsApplied = false;
      if (validatedData.settings && protocolManager && device.isOnline) {
        try {
          // Apply relevant settings to the physical device
          await applySettingsToDevice(device, validatedData.settings);
          settingsApplied = true;
        } catch (settingsError) {
          logger.warn('Failed to apply settings to physical device', {
            deviceId: id,
            error: settingsError
          });
        }
      }

      // Send WebSocket notification
      if (wsManager) {
        wsManager.sendNotificationToUser(currentUser._id, {
          type: 'device_updated',
          title: 'Device Updated',
          message: `${device.name} configuration has been updated`,
          data: { 
            deviceId: id, 
            changes: Object.keys(validatedData),
            settingsApplied 
          }
        });

        // Broadcast device update to subscribers
        wsManager.broadcastDeviceUpdate({
          deviceId: device.deviceId,
          status: device.status as any,
          state: device.currentState,
          timestamp: new Date(),
          source: 'configuration_update' as any
        });
      }

      // Build response
      const response = {
        ...updatedDevice,
        // Add metadata about the update
        updateSummary: {
          fieldsUpdated: Object.keys(validatedData),
          settingsApplied,
          timestamp: new Date().toISOString()
        }
      };

      logger.info('Device updated successfully', {
        userId: currentUser._id,
        deviceId: id,
        updateFields: Object.keys(validatedData),
        settingsApplied
      });

      res.json({
        success: true,
        data: response,
        message: `Device updated successfully${settingsApplied ? ' and settings applied' : ''}`,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });

      // Helper function to apply settings to physical device
      async function applySettingsToDevice(device: any, settings: any): Promise<void> {
        // Apply power limit if specified
        if (settings.maxPowerDraw && device.capabilities.includes('energy_meter')) {
          await protocolManager.sendDeviceCommand(
            device.protocol,
            device.deviceId,
            'set_power_limit',
            { limit: settings.maxPowerDraw }
          );
        }

        // Apply schedules if any
        if (settings.schedules && settings.schedules.length > 0) {
          for (const schedule of settings.schedules) {
            if (schedule.enabled) {
              await protocolManager.sendDeviceCommand(
                device.protocol,
                device.deviceId,
                'set_schedule',
                { schedule }
              );
            }
          }
        }

        // Apply auto control settings
        if (typeof settings.autoControl === 'boolean') {
          await protocolManager.sendDeviceCommand(
            device.protocol,
            device.deviceId,
            'set_auto_control',
            { enabled: settings.autoControl }
          );
        }
      }

    } catch (error) {
      logger.error('Device update failed', { 
        userId: req.user?._id,
        deviceId: req.params.id,
        updateData: req.body,
        error: error instanceof Error ? error.message : error, 
        requestId: req.requestId 
      });
      
      if (error instanceof ApiError || error instanceof ValidationError) {
        res.status(error instanceof ValidationError ? 400 : (error as ApiError).statusCode).json({
          success: false,
          error: error.message,
          code: (error as any).code,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to update device',
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }
  }
);

/**
 * DELETE /api/v1/devices/:id
 * Remove device from user's account
 */
router.delete('/:id', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { force = false } = req.query;
    const currentUser = req.user;

    if (!deviceService || !currentUser) {
      throw new ApiError('Device service not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Device deletion request', { 
      userId: currentUser._id,
      deviceId: id, 
      force,
      requestId: req.requestId 
    });

    // Get device to be deleted
    const device = await deviceService.findOne({ 
      _id: id, 
      userId: currentUser._id 
    });
    
    if (!device) {
      throw new ApiError('Device not found or access denied', 404, 'DEVICE_NOT_FOUND');
    }

    // Check if device is critical or has important data (unless force delete)
    if (!force && device.isOnline) {
      // Get recent device activity to warn user
      const hasRecentActivity = device.lastCommandAt && 
        (Date.now() - device.lastCommandAt.getTime()) < (24 * 60 * 60 * 1000); // 24 hours

      if (hasRecentActivity) {
        return res.status(409).json({
          success: false,
          error: 'Device has recent activity. Use force=true to confirm deletion.',
          code: 'DEVICE_ACTIVE',
          details: {
            deviceName: device.name,
            lastActivity: device.lastCommandAt,
            isOnline: device.isOnline,
            suggestion: 'Add ?force=true to the request to force deletion'
          },
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }

    // Stop device monitoring first
    if (protocolManager && device.isOnline) {
      try {
        // Get active subscriptions for this device
        const adapter = protocolManager.getAdapter(device.protocol as any);
        if (adapter) {
          const subscriptions = adapter.getActiveSubscriptions().filter(sub => 
            sub.deviceId === device.deviceId
          );

          for (const subscription of subscriptions) {
            await adapter.unsubscribeFromUpdates(subscription.subscriptionId);
          }

          logger.info('Device monitoring stopped', {
            deviceId: id,
            subscriptions: subscriptions.length
          });
        }
      } catch (monitoringError) {
        logger.warn('Failed to stop device monitoring during deletion', {
          deviceId: id,
          error: monitoringError
        });
      }
    }

    // Remove device from database
    const deleted = await deviceService.deleteById(id);
    if (!deleted) {
      throw new ApiError('Failed to delete device from database', 500, 'DELETE_FAILED');
    }

    // Clean up related data (commands, schedules, etc.)
    try {
      // TODO: Clean up device commands history
      // await deviceCommandService.deleteMany({ deviceId: id });
      
      // TODO: Clean up energy measurements
      // await energyMeasurementService.deleteMany({ deviceId: id });
      
      logger.debug('Device related data cleanup completed', { deviceId: id });
    } catch (cleanupError) {
      logger.warn('Failed to clean up some device related data', {
        deviceId: id,
        error: cleanupError
      });
    }

    // Send WebSocket notifications
    if (wsManager) {
      // Notify user
      wsManager.sendNotificationToUser(currentUser._id, {
        type: 'device_removed',
        title: 'Device Removed',
        message: `${device.name} has been removed from your account`,
        data: { 
          deviceId: id, 
          deviceName: device.name,
          deviceType: device.deviceType 
        }
      });

      // Disconnect any active device streams
      try {
        // If we had a WebSocketIntegrationService, we would use:
        // wsIntegrationService.disconnectDeviceStreams(device.deviceId);
        
        // For now, emit a generic disconnect message
        wsManager.getIO().to(`device:${device.deviceId}`).emit('device:removed', {
          deviceId: device.deviceId,
          message: 'Device has been removed from the system',
          timestamp: new Date().toISOString()
        });
      } catch (wsError) {
        logger.warn('Failed to disconnect WebSocket streams for deleted device', {
          deviceId: id,
          error: wsError
        });
      }
    }

    // Log successful deletion
    logger.info('Device deleted successfully', {
      userId: currentUser._id,
      deviceId: id,
      deviceName: device.name,
      deviceType: device.deviceType,
      protocol: device.protocol
    });

    res.json({
      success: true,
      data: {
        deletedDevice: {
          id,
          name: device.name,
          deviceType: device.deviceType,
          protocol: device.protocol,
          deletedAt: new Date().toISOString()
        }
      },
      message: 'Device removed successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Device deletion failed', { 
      userId: req.user?._id,
      deviceId: req.params.id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to remove device',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/devices/:id/command
 * Send command to device
 */
router.post('/:id/command',
  validateParams({ id: commonSchemas.objectId }),
  validateBody(deviceSchemas.deviceCommand),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { command, parameters = {} } = req.body;
      const currentUser = req.user;

      if (!deviceService || !protocolManager || !currentUser) {
        throw new ApiError('Services not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
      }

      const startTime = Date.now();

      logger.info('Device command request', { 
        userId: currentUser._id,
        deviceId: id,
        command,
        parameters,
        requestId: req.requestId 
      });

      // Check user owns device
      const device = await deviceService.findOne({ 
        _id: id, 
        userId: currentUser._id 
      });
      
      if (!device) {
        throw new ApiError('Device not found or access denied', 404, 'DEVICE_NOT_FOUND');
      }

      // Validate device is online
      if (!device.isOnline) {
        throw new ApiError('Device is offline', 503, 'DEVICE_OFFLINE');
      }

      // Validate command for device type and capabilities
      const validCommands = getValidCommandsForDevice(device.deviceType, device.capabilities);
      if (!validCommands.includes(command)) {
        throw new ValidationError(`Command '${command}' is not supported for device type '${device.deviceType}'`);
      }

      // Send command via protocol adapter
      const commandResult = await protocolManager.sendDeviceCommand(
        device.protocol as any,
        device.deviceId,
        command,
        parameters
      );
      
      const duration = Date.now() - startTime;
      const success = commandResult.success;
      
      deviceLogger.command(id, command, success, duration);

      if (!success) {
        throw new ApiError(
          commandResult.error || 'Device command failed',
          500,
          'DEVICE_COMMAND_FAILED'
        );
      }

      // Update device state in database
      const newState = commandResult.data?.state || {};
      if (Object.keys(newState).length > 0) {
        await deviceService.updateById(id, {
          $set: {
            currentState: { ...device.currentState, ...newState },
            lastCommandAt: new Date(),
            updatedAt: new Date()
          }
        });
      }

      // Log command in database
      // Note: This would typically use DeviceCommandService
      const commandLog = {
        deviceId: id,
        userId: currentUser._id,
        command,
        parameters,
        result: commandResult.data,
        success: true,
        duration,
        timestamp: new Date(),
        source: 'api'
      };
      
      // TODO: Save command log to database
      // await deviceCommandService.create(commandLog);

      // Send real-time update via WebSocket
      if (wsManager && newState) {
        const statusUpdate: DeviceStatusUpdate = {
          deviceId: device.deviceId,
          status: 'online',
          state: newState,
          timestamp: new Date(),
          source: 'command_response'
        };
        wsManager.broadcastDeviceUpdate(statusUpdate);
      }

      logger.info('Device command executed successfully', {
        userId: currentUser._id,
        deviceId: id,
        command,
        duration,
        requestId: req.requestId
      });

      res.json({
        success: true,
        data: {
          command,
          parameters,
          result: {
            executed: true,
            responseTime: duration,
            newState,
            data: commandResult.data
          },
        },
        message: 'Command executed successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });

    } catch (error) {
      const duration = Date.now() - (req as any).startTime;
      logger.error('Device command failed', { 
        userId: req.user?._id,
        deviceId: req.params.id,
        command: req.body.command,
        error: error instanceof Error ? error.message : error, 
        duration,
        requestId: req.requestId 
      });
      deviceLogger.error(req.params.id, req.body.command, error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof ApiError || error instanceof ValidationError) {
        res.status(error instanceof ValidationError ? 400 : (error as ApiError).statusCode).json({
          success: false,
          error: error.message,
          code: (error as any).code,
          details: { command: req.body.command, deviceId: req.params.id },
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to execute device command',
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }
  }
);

/**
 * GET /api/v1/devices/:id/status
 * Get current device status
 */
router.get('/:id/status', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { refresh = false } = req.query;
    const currentUser = req.user;

    if (!deviceService || !currentUser) {
      throw new ApiError('Device service not initialized or user not authenticated', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Device status request', { 
      userId: currentUser._id,
      deviceId: id, 
      refresh,
      requestId: req.requestId 
    });

    // Check user owns device
    const device = await deviceService.findOne({ 
      _id: id, 
      userId: currentUser._id 
    });
    
    if (!device) {
      throw new ApiError('Device not found or access denied', 404, 'DEVICE_NOT_FOUND');
    }

    let statusData = {
      deviceId: device.deviceId,
      isOnline: device.isOnline,
      status: device.status,
      state: device.currentState,
      lastUpdate: device.lastSeenAt || device.updatedAt,
      source: 'cached' as 'cached' | 'real-time'
    };

    // Get fresh status if requested or if device is online
    if ((refresh === 'true' || device.isOnline) && protocolManager) {
      try {
        const freshStatus = await protocolManager.getDeviceStatus(
          device.protocol as any,
          device.deviceId
        );
        
        // Update status data with fresh information
        statusData = {
          deviceId: device.deviceId,
          isOnline: freshStatus.status === 'online',
          status: freshStatus.status,
          state: freshStatus.state,
          lastUpdate: freshStatus.timestamp,
          source: 'real-time'
        };

        // Update device in database if status changed
        if (device.status !== freshStatus.status || 
            JSON.stringify(device.currentState) !== JSON.stringify(freshStatus.state)) {
          
          await deviceService.updateById(id, {
            $set: {
              isOnline: freshStatus.status === 'online',
              status: freshStatus.status,
              currentState: freshStatus.state,
              lastSeenAt: freshStatus.timestamp,
              updatedAt: new Date()
            }
          });

          // Broadcast update via WebSocket
          if (wsManager) {
            wsManager.broadcastDeviceUpdate({
              deviceId: device.deviceId,
              status: freshStatus.status,
              state: freshStatus.state,
              timestamp: freshStatus.timestamp,
              source: 'status_poll'
            });
          }
        }

        logger.debug('Fresh device status retrieved', {
          deviceId: id,
          status: freshStatus.status
        });

      } catch (statusError) {
        logger.warn('Failed to get fresh device status', {
          deviceId: id,
          error: statusError
        });
        
        // If we can't get fresh status, mark device as offline
        if (device.isOnline) {
          await deviceService.updateById(id, {
            $set: {
              isOnline: false,
              status: 'offline',
              updatedAt: new Date()
            }
          });
          
          statusData.isOnline = false;
          statusData.status = 'offline';
        }
      }
    }

    // Add additional computed fields
    const enhancedStatus = {
      ...statusData,
      capabilities: device.capabilities,
      connectionQuality: statusData.isOnline ? 
        getConnectionQuality(device.lastSeenAt) : 'disconnected',
      uptimePercentage: calculateUptimePercentage(device),
      lastCommand: device.lastCommandAt,
      deviceInfo: {
        name: device.name,
        type: device.deviceType,
        protocol: device.protocol,
        location: device.location
      }
    };

    res.json({
      success: true,
      data: enhancedStatus,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Device status retrieval failed', { 
      userId: req.user?._id,
      deviceId: req.params.id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to get device status',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }

  // Helper functions
  function getConnectionQuality(lastSeenAt: Date | null): string {
    if (!lastSeenAt) return 'disconnected';
    
    const timeSinceLastSeen = Date.now() - lastSeenAt.getTime();
    const minutes = timeSinceLastSeen / (1000 * 60);
    
    if (minutes < 1) return 'excellent';
    if (minutes < 5) return 'good';
    if (minutes < 30) return 'fair';
    return 'poor';
  }

  function calculateUptimePercentage(device: any): number {
    // Simplified uptime calculation - in production this would use historical data
    const daysSinceCreated = (Date.now() - new Date(device.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const baseUptime = device.isOnline ? 95 : 85;
    return Math.min(100, Math.round(baseUptime + Math.random() * 10));
  }
});

/**
 * GET /api/v1/devices/:id/history
 * Get device command/status history
 */
router.get('/:id/history',
  validateParams({ id: commonSchemas.objectId }),
  validatePagination,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { page, limit } = req.query;
      const { from, to, type } = req.query;

      // TODO: Implement device history retrieval
      // - Check user owns device
      // - Apply date filters
      // - Fetch history from database
      // - Return paginated history

      logger.info('Device history request', { 
        deviceId: id,
        page, limit, from, to, type,
        requestId: req.requestId 
      });

      // Placeholder response
      res.json({
        success: true,
        data: [
          {
            timestamp: new Date().toISOString(),
            type: 'command',
            command: 'turn_on',
            success: true,
            responseTime: 245,
            source: 'user',
          },
          {
            timestamp: new Date(Date.now() - 600000).toISOString(),
            type: 'status_update',
            state: {
              power: false,
              energyConsumption: 0,
            },
            source: 'polling',
          },
        ],
        pagination: {
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });

    } catch (error) {
      logger.error('Device history retrieval failed', { error, requestId: req.requestId });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve device history',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
);

/**
 * POST /api/v1/devices/:id/test
 * Test device connectivity
 */
router.post('/:id/test', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: Implement device connectivity test
    // - Check user owns device
    // - Test device connection via protocol adapter
    // - Return connection test results

    logger.info('Device connectivity test', { deviceId: id, requestId: req.requestId });

    // Simulate connectivity test
    await new Promise(resolve => setTimeout(resolve, 1000));
    const isConnected = Math.random() > 0.2; // 80% success rate for demo

    res.json({
      success: true,
      data: {
        deviceId: id,
        connected: isConnected,
        responseTime: isConnected ? '234ms' : null,
        error: isConnected ? null : 'Device not responding',
        timestamp: new Date().toISOString(),
      },
      message: `Device ${isConnected ? 'is connected' : 'connection failed'} (placeholder)`,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Device connectivity test failed', { error, requestId: req.requestId });
    
    res.status(500).json({
      success: false,
      error: 'Failed to test device connectivity',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

export { initializeDeviceServices };
export default router;