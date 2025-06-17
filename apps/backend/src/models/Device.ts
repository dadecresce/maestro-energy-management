import { Schema, model, Document, Types } from 'mongoose';
import {
  Device as DeviceType,
  DeviceCapability,
  DeviceSpecifications,
  Schedule,
  AlertConfig,
  DeviceSettings,
  DeviceCommand,
  CommandResult,
  DeviceStatusUpdate,
  SmartPlugState,
  SolarInverterState,
  BatteryPackState
} from '@maestro/shared/types/device';
import {
  DeviceType as DeviceTypeEnum,
  ProtocolType,
  EnergyRole,
  CapabilityType,
  DeviceStatus,
  CommandStatus,
  EnergyUnit,
  RecurrencePattern
} from '@maestro/shared/types/base';

/**
 * MongoDB Document Interface for Device
 * Extends the shared Device type with Mongoose Document methods
 */
export interface IDeviceDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  deviceId: string;
  protocol: ProtocolType;
  deviceType: DeviceTypeEnum;
  capabilities: DeviceCapability[];
  energyRole?: EnergyRole;
  name: string;
  description?: string;
  location?: string;
  room?: string;
  floor?: string;
  building?: string;
  specifications: DeviceSpecifications;
  isOnline: boolean;
  status: DeviceStatus;
  lastSeenAt: Date;
  lastCommandAt?: Date;
  currentState: Record<string, any>;
  settings: DeviceSettings;
  energyProfile?: {
    averagePower: number;
    peakPower: number;
    dailyEnergy: number;
    efficiencyRating: number;
    carbonFootprint?: number;
    costPerHour?: number;
  };
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  updateState(newState: Record<string, any>): Promise<void>;
  updateStatus(status: DeviceStatus, isOnline?: boolean): Promise<void>;
  addCapability(capability: DeviceCapability): Promise<void>;
  removeCapability(capabilityType: CapabilityType): Promise<void>;
  hasCapability(capabilityType: CapabilityType): boolean;
  executeCommand(command: string, parameters: Record<string, any>): Promise<CommandResult>;
  updateLastSeen(): Promise<void>;
  calculateEnergyProfile(measurements: any[]): Promise<void>;
  isSmartPlug(): this is IDeviceDocument & { currentState: SmartPlugState };
  isSolarInverter(): this is IDeviceDocument & { currentState: SolarInverterState };
  isBatteryPack(): this is IDeviceDocument & { currentState: BatteryPackState };
}

/**
 * Device Capability Schema
 */
const DeviceCapabilitySchema = new Schema<DeviceCapability>({
  type: {
    type: String,
    enum: [
      'switch', 'dimmer', 'color', 'thermostat',
      'energy_meter', 'temperature_sensor', 'humidity_sensor', 'motion_sensor',
      'scheduler', 'automation',
      'power_control', 'energy_storage', 'grid_interaction', 'load_balancing'
    ],
    required: true
  },
  properties: {
    type: Schema.Types.Mixed,
    default: {}
  },
  commands: {
    type: [String],
    default: []
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  range: {
    min: Number,
    max: Number,
    step: Number
  }
}, { _id: false });

/**
 * Device Specifications Schema
 */
const DeviceSpecificationsSchema = new Schema<DeviceSpecifications>({
  manufacturer: {
    type: String,
    required: [true, 'Manufacturer is required'],
    trim: true
  },
  model: {
    type: String,
    required: [true, 'Model is required'],
    trim: true
  },
  firmwareVersion: String,
  hardwareVersion: String,
  maxPower: {
    type: Number,
    min: 0
  },
  capacity: {
    type: Number,
    min: 0
  },
  voltage: {
    type: Number,
    min: 0
  },
  frequency: {
    type: Number,
    min: 0
  },
  phases: {
    type: Number,
    min: 1,
    max: 3,
    default: 1
  },
  certifications: {
    type: [String],
    default: []
  }
}, { _id: false });

/**
 * Schedule Schema
 */
const ScheduleSchema = new Schema<Schedule>({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  pattern: {
    type: String,
    enum: ['once', 'daily', 'weekly', 'monthly', 'yearly', 'custom'],
    required: true
  },
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  endTime: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'End time must be in HH:MM format'
    }
  },
  daysOfWeek: {
    type: [Number],
    validate: {
      validator: function(days: number[]) {
        return days.every(day => day >= 0 && day <= 6);
      },
      message: 'Days of week must be between 0 (Sunday) and 6 (Saturday)'
    }
  },
  daysOfMonth: {
    type: [Number],
    validate: {
      validator: function(days: number[]) {
        return days.every(day => day >= 1 && day <= 31);
      },
      message: 'Days of month must be between 1 and 31'
    }
  },
  command: {
    type: Schema.Types.Mixed,
    required: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  validFrom: Date,
  validUntil: Date
}, { 
  timestamps: true,
  _id: false 
});

/**
 * Alert Configuration Schema
 */
const AlertConfigSchema = new Schema<AlertConfig>({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['offline', 'high_consumption', 'low_battery', 'maintenance', 'custom'],
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  threshold: Number,
  unit: {
    type: String,
    enum: ['W', 'kW', 'MW', 'Wh', 'kWh', 'MWh', 'V', 'A', 'Hz', 'pf']
  },
  message: {
    type: String,
    required: true
  },
  channels: {
    type: [String],
    enum: ['push', 'email', 'sms', 'webhook'],
    default: ['push']
  },
  cooldown: {
    type: Number,
    default: 300,
    min: 0
  }
}, { 
  timestamps: true,
  _id: false 
});

/**
 * Device Settings Schema
 */
const DeviceSettingsSchema = new Schema<DeviceSettings>({
  autoControl: {
    type: Boolean,
    default: false
  },
  schedules: {
    type: [ScheduleSchema],
    default: []
  },
  alerts: {
    type: [AlertConfigSchema],
    default: []
  },
  energyOptimization: {
    type: Boolean,
    default: false
  },
  loadPriority: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  maxPowerDraw: {
    type: Number,
    min: 0
  },
  customProperties: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

/**
 * Energy Profile Schema (Phase 2)
 */
const EnergyProfileSchema = new Schema({
  averagePower: {
    type: Number,
    required: true,
    min: 0
  },
  peakPower: {
    type: Number,
    required: true,
    min: 0
  },
  dailyEnergy: {
    type: Number,
    required: true,
    min: 0
  },
  efficiencyRating: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  carbonFootprint: {
    type: Number,
    min: 0
  },
  costPerHour: {
    type: Number,
    min: 0
  }
}, { _id: false });

/**
 * Main Device Schema
 */
const DeviceSchema = new Schema<IDeviceDocument>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true
  },
  protocol: {
    type: String,
    enum: ['tuya', 'modbus', 'mqtt', 'sunspec', 'can_bus', 'rest_api', 'local_network'],
    required: [true, 'Protocol is required']
  },
  deviceType: {
    type: String,
    enum: ['smart_plug', 'solar_inverter', 'battery_pack', 'energy_meter', 'heat_pump', 'ev_charger'],
    required: [true, 'Device type is required']
  },
  capabilities: {
    type: [DeviceCapabilitySchema],
    required: true,
    validate: {
      validator: function(capabilities: DeviceCapability[]) {
        return capabilities.length > 0;
      },
      message: 'Device must have at least one capability'
    }
  },
  energyRole: {
    type: String,
    enum: ['consumer', 'producer', 'storage', 'bidirectional', 'monitor']
  },
  name: {
    type: String,
    required: [true, 'Device name is required'],
    trim: true,
    maxlength: [100, 'Device name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  location: {
    type: String,
    trim: true
  },
  room: {
    type: String,
    trim: true
  },
  floor: String,
  building: String,
  specifications: {
    type: DeviceSpecificationsSchema,
    required: true
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'unknown', 'error', 'maintenance'],
    default: 'unknown',
    index: true
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastCommandAt: Date,
  currentState: {
    type: Schema.Types.Mixed,
    default: {}
  },
  settings: {
    type: DeviceSettingsSchema,
    default: () => ({})
  },
  energyProfile: EnergyProfileSchema
}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  }
});

/**
 * Indexes for optimal query performance
 */
DeviceSchema.index({ userId: 1 });
DeviceSchema.index({ deviceId: 1, userId: 1 }, { unique: true });
DeviceSchema.index({ protocol: 1 });
DeviceSchema.index({ deviceType: 1 });
DeviceSchema.index({ isOnline: 1 });
DeviceSchema.index({ status: 1 });
DeviceSchema.index({ lastSeenAt: 1 });
DeviceSchema.index({ 'specifications.manufacturer': 1 });
DeviceSchema.index({ 'specifications.model': 1 });
DeviceSchema.index({ location: 1 });
DeviceSchema.index({ room: 1 });
DeviceSchema.index({ energyRole: 1 });
DeviceSchema.index({ createdAt: 1 });
DeviceSchema.index({ updatedAt: 1 });

// Compound indexes for complex queries
DeviceSchema.index({ userId: 1, deviceType: 1 });
DeviceSchema.index({ userId: 1, status: 1 });
DeviceSchema.index({ userId: 1, isOnline: 1 });
DeviceSchema.index({ userId: 1, protocol: 1 });
DeviceSchema.index({ deviceType: 1, energyRole: 1 });

/**
 * Pre-save middleware
 */
DeviceSchema.pre('save', function(next) {
  // Update lastSeenAt when device comes online
  if (this.isModified('isOnline') && this.isOnline) {
    this.lastSeenAt = new Date();
  }
  
  // Set status based on online state
  if (this.isModified('isOnline')) {
    this.status = this.isOnline ? 'online' : 'offline';
  }
  
  next();
});

/**
 * Instance Methods
 */

// Update device state
DeviceSchema.methods.updateState = async function(newState: Record<string, any>): Promise<void> {
  this.currentState = { ...this.currentState, ...newState };
  this.lastSeenAt = new Date();
  if (!this.isOnline) {
    this.isOnline = true;
    this.status = 'online';
  }
  await this.save();
};

// Update device status
DeviceSchema.methods.updateStatus = async function(status: DeviceStatus, isOnline?: boolean): Promise<void> {
  this.status = status;
  if (isOnline !== undefined) {
    this.isOnline = isOnline;
  }
  this.lastSeenAt = new Date();
  await this.save();
};

// Add capability
DeviceSchema.methods.addCapability = async function(capability: DeviceCapability): Promise<void> {
  const existingIndex = this.capabilities.findIndex(cap => cap.type === capability.type);
  if (existingIndex >= 0) {
    this.capabilities[existingIndex] = capability;
  } else {
    this.capabilities.push(capability);
  }
  await this.save();
};

// Remove capability
DeviceSchema.methods.removeCapability = async function(capabilityType: CapabilityType): Promise<void> {
  this.capabilities = this.capabilities.filter(cap => cap.type !== capabilityType);
  await this.save();
};

// Check if device has capability
DeviceSchema.methods.hasCapability = function(capabilityType: CapabilityType): boolean {
  return this.capabilities.some(cap => cap.type === capabilityType);
};

// Execute command (placeholder - actual implementation would use protocol adapters)
DeviceSchema.methods.executeCommand = async function(
  command: string, 
  parameters: Record<string, any> = {}
): Promise<CommandResult> {
  const startTime = Date.now();
  
  try {
    // This would be implemented using the protocol adapter manager
    // For now, return a success result
    const result: CommandResult = {
      success: true,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
      result: parameters,
      retryCount: 0
    };
    
    this.lastCommandAt = new Date();
    await this.save();
    
    return result;
  } catch (error) {
    return {
      success: false,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Command execution failed',
      retryCount: 0
    };
  }
};

// Update last seen timestamp
DeviceSchema.methods.updateLastSeen = async function(): Promise<void> {
  this.lastSeenAt = new Date();
  if (!this.isOnline) {
    this.isOnline = true;
    this.status = 'online';
  }
  await this.save();
};

// Calculate energy profile from measurements
DeviceSchema.methods.calculateEnergyProfile = async function(measurements: any[]): Promise<void> {
  if (measurements.length === 0) return;
  
  // Calculate basic energy profile metrics
  const powerReadings = measurements
    .map(m => m.measurements?.activePower)
    .filter(p => typeof p === 'number');
  
  if (powerReadings.length === 0) return;
  
  const averagePower = powerReadings.reduce((sum, p) => sum + p, 0) / powerReadings.length;
  const peakPower = Math.max(...powerReadings);
  const dailyEnergy = (averagePower * 24) / 1000; // Convert to kWh
  
  this.energyProfile = {
    averagePower,
    peakPower,
    dailyEnergy,
    efficiencyRating: Math.min(averagePower / (this.specifications.maxPower || averagePower), 1),
    carbonFootprint: dailyEnergy * 0.5, // Placeholder carbon factor
    costPerHour: (averagePower / 1000) * 0.25 // Placeholder energy rate
  };
  
  await this.save();
};

// Type guards for device states
DeviceSchema.methods.isSmartPlug = function(): boolean {
  return this.deviceType === 'smart_plug';
};

DeviceSchema.methods.isSolarInverter = function(): boolean {
  return this.deviceType === 'solar_inverter';
};

DeviceSchema.methods.isBatteryPack = function(): boolean {
  return this.deviceType === 'battery_pack';
};

/**
 * Static Methods
 */

// Find devices by user
DeviceSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId });
};

// Find online devices
DeviceSchema.statics.findOnline = function(userId?: string) {
  const query = { isOnline: true, status: 'online' };
  if (userId) {
    (query as any).userId = userId;
  }
  return this.find(query);
};

// Find devices by type
DeviceSchema.statics.findByType = function(deviceType: DeviceTypeEnum, userId?: string) {
  const query = { deviceType };
  if (userId) {
    (query as any).userId = userId;
  }
  return this.find(query);
};

// Find devices by protocol
DeviceSchema.statics.findByProtocol = function(protocol: ProtocolType, userId?: string) {
  const query = { protocol };
  if (userId) {
    (query as any).userId = userId;
  }
  return this.find(query);
};

// Find devices with specific capability
DeviceSchema.statics.findWithCapability = function(capabilityType: CapabilityType, userId?: string) {
  const query = { 'capabilities.type': capabilityType };
  if (userId) {
    (query as any).userId = userId;
  }
  return this.find(query);
};

// Get device statistics
DeviceSchema.statics.getStatistics = function(userId?: string) {
  const matchStage = userId ? { $match: { userId } } : { $match: {} };
  
  return this.aggregate([
    matchStage,
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
        averageEnergyProfile: {
          $avg: '$energyProfile.averagePower'
        }
      }
    },
    {
      $project: {
        totalDevices: 1,
        onlineDevices: 1,
        offlineDevices: { $subtract: ['$totalDevices', '$onlineDevices'] },
        devicesByType: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: ['$devicesByType'] },
              as: 'type',
              in: {
                k: '$$type',
                v: {
                  $size: {
                    $filter: {
                      input: '$devicesByType',
                      cond: { $eq: ['$$this', '$$type'] }
                    }
                  }
                }
              }
            }
          }
        },
        averageEnergyProfile: 1
      }
    }
  ]);
};

/**
 * Device Model Export
 */
export const Device = model<IDeviceDocument>('Device', DeviceSchema);
export default Device;

/**
 * Type exports for external use
 */
export type { IDeviceDocument };
export { DeviceSchema };