import { FilterQuery, Types } from 'mongoose';
import { Device, IDeviceDocument } from '@/models/Device';
import { BaseService } from './BaseService';
import {
  DeviceType,
  ProtocolType,
  EnergyRole,
  CapabilityType,
  DeviceStatus
} from '@maestro/shared/types/base';
import {
  DeviceCapability,
  DeviceSpecifications,
  Schedule,
  AlertConfig,
  CommandResult
} from '@maestro/shared/types/device';
import { QueryFilters } from '@maestro/shared/types';
import { ValidationError, NotFoundError } from '@/utils/errors';
import logger from '@/config/logger';

/**
 * Device Service
 * 
 * Provides comprehensive device management operations including
 * device registration, control, monitoring, and analytics.
 */
export class DeviceService extends BaseService<IDeviceDocument> {
  constructor() {
    super(Device);
  }

  /**
   * Register a new device
   */
  async registerDevice(
    userId: string,
    deviceData: {
      deviceId: string;
      protocol: ProtocolType;
      deviceType: DeviceType;
      name: string;
      specifications: DeviceSpecifications;
      capabilities: DeviceCapability[];
      description?: string;
      location?: string;
      room?: string;
      energyRole?: EnergyRole;
    }
  ): Promise<IDeviceDocument> {
    try {
      // Check if device already exists for this user
      const existingDevice = await this.findOne({
        userId,
        deviceId: deviceData.deviceId
      });

      if (existingDevice) {
        throw new ValidationError(`Device with ID ${deviceData.deviceId} already exists for this user`);
      }

      const device = await this.create({
        ...deviceData,
        userId,
        isOnline: false,
        status: 'unknown',
        lastSeenAt: new Date(),
        currentState: {},
        settings: {
          autoControl: false,
          schedules: [],
          alerts: [],
          energyOptimization: false,
          loadPriority: 5,
          customProperties: {}
        }
      });

      logger.info('Device registered successfully', {
        deviceId: device._id,
        userId,
        deviceType: device.deviceType,
        protocol: device.protocol
      });

      return device;
    } catch (error) {
      logger.error('Failed to register device', { userId, deviceData, error });
      throw error;
    }
  }

  /**
   * Find devices by user
   */
  async findByUser(
    userId: string,
    filters?: {
      deviceType?: DeviceType;
      protocol?: ProtocolType;
      status?: DeviceStatus;
      isOnline?: boolean;
      room?: string;
      energyRole?: EnergyRole;
    }
  ): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = { userId };

    if (filters) {
      if (filters.deviceType) filter.deviceType = filters.deviceType;
      if (filters.protocol) filter.protocol = filters.protocol;
      if (filters.status) filter.status = filters.status;
      if (filters.isOnline !== undefined) filter.isOnline = filters.isOnline;
      if (filters.room) filter.room = filters.room;
      if (filters.energyRole) filter.energyRole = filters.energyRole;
    }

    return this.find(filter, null, { sort: { name: 1 } });
  }

  /**
   * Find device by external device ID and user
   */
  async findByDeviceId(userId: string, deviceId: string): Promise<IDeviceDocument | null> {
    return this.findOne({ userId, deviceId });
  }

  /**
   * Find online devices
   */
  async findOnlineDevices(userId?: string): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = {
      isOnline: true,
      status: 'online'
    };

    if (userId) {
      filter.userId = userId;
    }

    return this.find(filter);
  }

  /**
   * Find devices by type
   */
  async findByType(deviceType: DeviceType, userId?: string): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = { deviceType };
    if (userId) {
      filter.userId = userId;
    }

    return this.find(filter);
  }

  /**
   * Find devices with specific capability
   */
  async findWithCapability(capabilityType: CapabilityType, userId?: string): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = {
      'capabilities.type': capabilityType
    };

    if (userId) {
      filter.userId = userId;
    }

    return this.find(filter);
  }

  /**
   * Update device state
   */
  async updateDeviceState(
    deviceId: string,
    newState: Record<string, any>
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    await device.updateState(newState);

    logger.debug('Device state updated', { deviceId, newState });
    return device;
  }

  /**
   * Update device status
   */
  async updateDeviceStatus(
    deviceId: string,
    status: DeviceStatus,
    isOnline?: boolean
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    await device.updateStatus(status, isOnline);

    logger.debug('Device status updated', { deviceId, status, isOnline });
    return device;
  }

  /**
   * Update device last seen timestamp
   */
  async updateLastSeen(deviceId: string): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    await device.updateLastSeen();

    return device;
  }

  /**
   * Add capability to device
   */
  async addCapability(
    deviceId: string,
    capability: DeviceCapability
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    await device.addCapability(capability);

    logger.info('Capability added to device', { deviceId, capabilityType: capability.type });
    return device;
  }

  /**
   * Remove capability from device
   */
  async removeCapability(
    deviceId: string,
    capabilityType: CapabilityType
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    await device.removeCapability(capabilityType);

    logger.info('Capability removed from device', { deviceId, capabilityType });
    return device;
  }

  /**
   * Add schedule to device
   */
  async addSchedule(
    deviceId: string,
    schedule: Schedule
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    
    // Check if schedule ID already exists
    const existingSchedule = device.settings.schedules.find(s => s.id === schedule.id);
    if (existingSchedule) {
      throw new ValidationError(`Schedule with ID ${schedule.id} already exists`);
    }

    device.settings.schedules.push(schedule);
    await device.save();

    logger.info('Schedule added to device', { deviceId, scheduleId: schedule.id });
    return device;
  }

  /**
   * Update schedule on device
   */
  async updateSchedule(
    deviceId: string,
    scheduleId: string,
    updates: Partial<Schedule>
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    
    const schedule = device.settings.schedules.find(s => s.id === scheduleId);
    if (!schedule) {
      throw new NotFoundError('Schedule not found');
    }

    Object.assign(schedule, { ...updates, updatedAt: new Date() });
    await device.save();

    logger.info('Schedule updated on device', { deviceId, scheduleId });
    return device;
  }

  /**
   * Remove schedule from device
   */
  async removeSchedule(
    deviceId: string,
    scheduleId: string
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    
    device.settings.schedules = device.settings.schedules.filter(s => s.id !== scheduleId);
    await device.save();

    logger.info('Schedule removed from device', { deviceId, scheduleId });
    return device;
  }

  /**
   * Add alert configuration to device
   */
  async addAlert(
    deviceId: string,
    alert: AlertConfig
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    
    // Check if alert ID already exists
    const existingAlert = device.settings.alerts.find(a => a.id === alert.id);
    if (existingAlert) {
      throw new ValidationError(`Alert with ID ${alert.id} already exists`);
    }

    device.settings.alerts.push(alert);
    await device.save();

    logger.info('Alert added to device', { deviceId, alertId: alert.id });
    return device;
  }

  /**
   * Update device settings
   */
  async updateSettings(
    deviceId: string,
    settings: Partial<IDeviceDocument['settings']>
  ): Promise<IDeviceDocument> {
    const device = await this.updateByIdOrThrow(deviceId, {
      $set: {
        settings: { ...settings },
        updatedAt: new Date()
      }
    });

    logger.info('Device settings updated', { deviceId });
    return device;
  }

  /**
   * Execute command on device
   */
  async executeCommand(
    deviceId: string,
    command: string,
    parameters: Record<string, any> = {}
  ): Promise<CommandResult> {
    const device = await this.findByIdOrThrow(deviceId);
    
    // Check if device has the required capability for this command
    const hasCapability = device.capabilities.some(cap => 
      cap.commands.includes(command)
    );

    if (!hasCapability) {
      throw new ValidationError(`Device does not support command: ${command}`);
    }

    const result = await device.executeCommand(command, parameters);

    logger.info('Command executed on device', { 
      deviceId, 
      command, 
      success: result.success,
      responseTime: result.responseTime 
    });

    return result;
  }

  /**
   * Calculate and update energy profile
   */
  async updateEnergyProfile(
    deviceId: string,
    measurements: any[]
  ): Promise<IDeviceDocument> {
    const device = await this.findByIdOrThrow(deviceId);
    await device.calculateEnergyProfile(measurements);

    logger.debug('Energy profile updated for device', { deviceId });
    return device;
  }

  /**
   * Search devices with filters
   */
  async searchDevices(
    userId: string,
    queryFilters: QueryFilters,
    pagination: { page?: number; limit?: number } = {}
  ) {
    const filter = this.buildDeviceFilter(userId, queryFilters);
    const sort = this.buildSort(queryFilters.sort);

    return this.findWithPagination(filter, {
      ...pagination,
      sort
    });
  }

  /**
   * Get device statistics for user
   */
  async getUserDeviceStatistics(userId: string): Promise<any> {
    const stats = await this.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalDevices: { $sum: 1 },
          onlineDevices: {
            $sum: { $cond: ['$isOnline', 1, 0] }
          },
          devicesByType: {
            $push: '$deviceType'
          },
          devicesByProtocol: {
            $push: '$protocol'
          },
          devicesByRoom: {
            $push: '$room'
          },
          averageEnergyConsumption: {
            $avg: '$energyProfile.averagePower'
          },
          totalPeakPower: {
            $sum: '$energyProfile.peakPower'
          }
        }
      }
    ]);

    return stats[0] || {
      totalDevices: 0,
      onlineDevices: 0,
      devicesByType: {},
      devicesByProtocol: {},
      devicesByRoom: {},
      averageEnergyConsumption: 0,
      totalPeakPower: 0
    };
  }

  /**
   * Get system-wide device statistics
   */
  async getSystemDeviceStatistics(): Promise<any> {
    return this.aggregate([
      {
        $group: {
          _id: null,
          totalDevices: { $sum: 1 },
          onlineDevices: {
            $sum: { $cond: ['$isOnline', 1, 0] }
          },
          devicesByType: {
            $push: '$deviceType'
          },
          devicesByProtocol: {
            $push: '$protocol'
          },
          uniqueUsers: {
            $addToSet: '$userId'
          },
          averageDevicesPerUser: {
            $avg: { $size: { $group: { _id: '$userId' } } }
          }
        }
      }
    ]);
  }

  /**
   * Get devices requiring attention (offline, errors, etc.)
   */
  async getDevicesRequiringAttention(userId?: string): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = {
      $or: [
        { status: 'error' },
        { status: 'maintenance' },
        { 
          status: 'offline',
          lastSeenAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Offline for more than 24 hours
        }
      ]
    };

    if (userId) {
      filter.userId = userId;
    }

    return this.find(filter, null, { sort: { lastSeenAt: 1 } });
  }

  /**
   * Get energy-producing devices (Phase 2)
   */
  async getEnergyProducers(userId?: string): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = {
      energyRole: { $in: ['producer', 'bidirectional'] }
    };

    if (userId) {
      filter.userId = userId;
    }

    return this.find(filter);
  }

  /**
   * Get energy-consuming devices
   */
  async getEnergyConsumers(userId?: string): Promise<IDeviceDocument[]> {
    const filter: FilterQuery<IDeviceDocument> = {
      energyRole: { $in: ['consumer', 'bidirectional'] }
    };

    if (userId) {
      filter.userId = userId;
    }

    return this.find(filter);
  }

  /**
   * Bulk update device statuses
   */
  async bulkUpdateStatus(
    updates: Array<{
      deviceId: string;
      status: DeviceStatus;
      isOnline: boolean;
      lastSeenAt?: Date;
    }>
  ): Promise<void> {
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.deviceId },
        update: {
          $set: {
            status: update.status,
            isOnline: update.isOnline,
            lastSeenAt: update.lastSeenAt || new Date(),
            updatedAt: new Date()
          }
        }
      }
    }));

    await this.bulkWrite(bulkOps);
    logger.info('Bulk device status updated', { count: updates.length });
  }

  /**
   * Get device uptime statistics
   */
  async getUptimeStatistics(
    deviceId: string,
    days: number = 30
  ): Promise<{
    uptimePercentage: number;
    totalHours: number;
    onlineHours: number;
    offlineHours: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const device = await this.findByIdOrThrow(deviceId);
    
    // This is a simplified calculation
    // In a real implementation, you'd want to track status changes over time
    const totalHours = days * 24;
    const now = new Date();
    const timeSinceLastSeen = now.getTime() - device.lastSeenAt.getTime();
    const hoursSinceLastSeen = timeSinceLastSeen / (1000 * 60 * 60);
    
    let onlineHours = totalHours;
    if (!device.isOnline) {
      onlineHours = Math.max(0, totalHours - hoursSinceLastSeen);
    }
    
    const offlineHours = totalHours - onlineHours;
    const uptimePercentage = (onlineHours / totalHours) * 100;

    return {
      uptimePercentage: Math.round(uptimePercentage * 100) / 100,
      totalHours,
      onlineHours: Math.round(onlineHours * 100) / 100,
      offlineHours: Math.round(offlineHours * 100) / 100
    };
  }

  /**
   * Build device-specific filter
   */
  private buildDeviceFilter(userId: string, queryFilters: QueryFilters): FilterQuery<IDeviceDocument> {
    const filter: FilterQuery<IDeviceDocument> = { userId };

    // Search in name, description, and location
    if (queryFilters.search) {
      filter.$or = [
        { name: { $regex: queryFilters.search, $options: 'i' } },
        { description: { $regex: queryFilters.search, $options: 'i' } },
        { location: { $regex: queryFilters.search, $options: 'i' } },
        { room: { $regex: queryFilters.search, $options: 'i' } }
      ];
    }

    // Device type filter
    if (queryFilters.type) {
      filter.deviceType = queryFilters.type;
    }

    // Status filter
    if (queryFilters.status) {
      if (queryFilters.status === 'online') {
        filter.isOnline = true;
        filter.status = 'online';
      } else if (queryFilters.status === 'offline') {
        filter.$or = [
          { isOnline: false },
          { status: 'offline' }
        ];
      } else {
        filter.status = queryFilters.status;
      }
    }

    // Protocol filter
    if (queryFilters.protocol) {
      filter.protocol = queryFilters.protocol;
    }

    // Room filter
    if (queryFilters.room) {
      filter.room = queryFilters.room;
    }

    // Energy role filter
    if (queryFilters.energyRole) {
      filter.energyRole = queryFilters.energyRole;
    }

    // Date range filter
    if (queryFilters.dateFrom || queryFilters.dateTo) {
      filter.createdAt = {};
      if (queryFilters.dateFrom) {
        filter.createdAt.$gte = new Date(queryFilters.dateFrom);
      }
      if (queryFilters.dateTo) {
        filter.createdAt.$lte = new Date(queryFilters.dateTo);
      }
    }

    return filter;
  }
}

export default DeviceService;