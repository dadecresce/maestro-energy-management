import { z } from 'zod';
import { 
  ObjectId, 
  DeviceType, 
  ProtocolType, 
  EnergyRole, 
  CapabilityType, 
  DeviceStatus,
  EnergyUnit,
  RecurrencePattern
} from './base';

// Device Capability Schema
export const DeviceCapabilitySchema = z.object({
  type: CapabilityType,
  properties: z.record(z.any()),
  commands: z.array(z.string()),
  readOnly: z.boolean().default(false),
  // Future: Min/max values for numeric capabilities
  range: z.object({
    min: z.number(),
    max: z.number(),
    step: z.number().optional()
  }).optional()
});

export type DeviceCapability = z.infer<typeof DeviceCapabilitySchema>;

// Device Specifications Schema
export const DeviceSpecificationsSchema = z.object({
  manufacturer: z.string(),
  model: z.string(),
  firmwareVersion: z.string().optional(),
  hardwareVersion: z.string().optional(),
  maxPower: z.number().optional(), // Watts
  capacity: z.number().optional(), // For batteries: kWh
  voltage: z.number().optional(), // Operating voltage
  frequency: z.number().optional(), // For AC devices: Hz
  phases: z.number().min(1).max(3).default(1), // Single or three-phase
  certifications: z.array(z.string()).default([]), // CE, FCC, etc.
});

export type DeviceSpecifications = z.infer<typeof DeviceSpecificationsSchema>;

// Schedule Configuration Schema
export const ScheduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean().default(true),
  pattern: RecurrencePattern,
  startTime: z.string(), // HH:MM format
  endTime: z.string().optional(), // For duration-based schedules
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(), // 0 = Sunday
  daysOfMonth: z.array(z.number().min(1).max(31)).optional(),
  command: z.record(z.any()), // The command to execute
  timezone: z.string().default('UTC'),
  validFrom: z.date().optional(),
  validUntil: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type Schedule = z.infer<typeof ScheduleSchema>;

// Alert Configuration Schema
export const AlertConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['offline', 'high_consumption', 'low_battery', 'maintenance', 'custom']),
  enabled: z.boolean().default(true),
  threshold: z.number().optional(), // For threshold-based alerts
  unit: EnergyUnit.optional(),
  message: z.string(),
  channels: z.array(z.enum(['push', 'email', 'sms', 'webhook'])),
  cooldown: z.number().default(300), // Seconds between alerts
  createdAt: z.date(),
  updatedAt: z.date()
});

export type AlertConfig = z.infer<typeof AlertConfigSchema>;

// Device Settings Schema
export const DeviceSettingsSchema = z.object({
  autoControl: z.boolean().default(false),
  schedules: z.array(ScheduleSchema).default([]),
  alerts: z.array(AlertConfigSchema).default([]),
  energyOptimization: z.boolean().default(false), // Phase 2
  loadPriority: z.number().min(1).max(10).default(5), // Phase 2
  maxPowerDraw: z.number().optional(), // Watts limit
  customProperties: z.record(z.any()).default({})
});

export type DeviceSettings = z.infer<typeof DeviceSettingsSchema>;

// Main Device Schema
export const DeviceSchema = z.object({
  _id: z.string(), // MongoDB ObjectId
  userId: z.string(), // Owner user ID
  
  // Device Identity
  deviceId: z.string(), // External device ID (Tuya, Modbus address, etc.)
  protocol: ProtocolType,
  deviceType: DeviceType,
  
  // Capabilities (extensible for future device types)
  capabilities: z.array(DeviceCapabilitySchema),
  
  // Energy classification (Phase 2)
  energyRole: EnergyRole.optional(),
  
  // Physical properties
  name: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  room: z.string().optional(),
  floor: z.string().optional(),
  building: z.string().optional(),
  specifications: DeviceSpecificationsSchema,
  
  // Current status
  isOnline: z.boolean(),
  status: DeviceStatus,
  lastSeenAt: z.date(),
  lastCommandAt: z.date().optional(),
  
  // Current state (device-specific properties)
  currentState: z.record(z.any()).default({}),
  
  // User settings
  settings: DeviceSettingsSchema.default({}),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
  
  // Future: Energy optimization data
  energyProfile: z.object({
    averagePower: z.number(), // Average power consumption (W)
    peakPower: z.number(), // Peak power consumption (W)
    dailyEnergy: z.number(), // Daily energy consumption (kWh)
    efficiencyRating: z.number().min(0).max(1), // 0-1 efficiency score
    carbonFootprint: z.number().optional(), // kg CO2/kWh
    costPerHour: z.number().optional(), // Currency per hour
  }).optional()
});

export type Device = z.infer<typeof DeviceSchema>;

// Device Command Schema
export const DeviceCommandSchema = z.object({
  deviceId: z.string(),
  command: z.string(),
  parameters: z.record(z.any()).default({}),
  timestamp: z.date().default(() => new Date())
});

export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;

// Device Command Result Schema
export const CommandResultSchema = z.object({
  success: z.boolean(),
  timestamp: z.date(),
  responseTime: z.number(), // milliseconds
  result: z.record(z.any()).optional(),
  error: z.string().optional(),
  retryCount: z.number().default(0)
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

// Device Status Update Schema
export const DeviceStatusUpdateSchema = z.object({
  deviceId: z.string(),
  status: DeviceStatus,
  state: z.record(z.any()),
  timestamp: z.date(),
  source: z.enum(['polling', 'webhook', 'manual', 'automation'])
});

export type DeviceStatusUpdate = z.infer<typeof DeviceStatusUpdateSchema>;

// Device Discovery Schema
export const DeviceDiscoverySchema = z.object({
  protocol: ProtocolType,
  deviceId: z.string(),
  deviceType: DeviceType,
  name: z.string().optional(),
  specifications: DeviceSpecificationsSchema.partial(),
  capabilities: z.array(DeviceCapabilitySchema),
  networkInfo: z.object({
    ipAddress: z.string().optional(),
    macAddress: z.string().optional(),
    networkId: z.string().optional()
  }).optional(),
  discoveredAt: z.date(),
  confidence: z.number().min(0).max(1) // Discovery confidence score
});

export type DeviceDiscovery = z.infer<typeof DeviceDiscoverySchema>;

// Helper types for specific device categories

// Smart Plug specific state
export interface SmartPlugState {
  power: boolean; // On/Off state
  energyConsumption?: number; // Current power draw (W)
  voltage?: number; // Operating voltage (V)
  current?: number; // Current draw (A)
  totalEnergy?: number; // Cumulative energy (kWh)
}

// Solar Inverter specific state (Phase 2)
export interface SolarInverterState {
  powerOutput: number; // Current power output (W)
  dailyGeneration: number; // Daily energy generated (kWh)
  totalGeneration: number; // Lifetime energy generated (kWh)
  efficiency: number; // Current efficiency (0-1)
  gridFrequency: number; // Grid frequency (Hz)
  gridVoltage: number; // Grid voltage (V)
  temperature: number; // Inverter temperature (°C)
  status: 'generating' | 'standby' | 'fault' | 'maintenance';
}

// Battery Pack specific state (Phase 2)
export interface BatteryPackState {
  chargeLevel: number; // State of charge (0-100%)
  chargingPower: number; // Current charging/discharging power (W, negative for discharge)
  voltage: number; // Battery voltage (V)
  current: number; // Battery current (A)
  temperature: number; // Battery temperature (°C)
  cycleCount: number; // Number of charge cycles
  health: number; // Battery health (0-100%)
  mode: 'charging' | 'discharging' | 'idle' | 'maintenance';
}

// Type guards for device states
export const isSmartPlugState = (state: any): state is SmartPlugState => {
  return typeof state === 'object' && typeof state.power === 'boolean';
};

export const isSolarInverterState = (state: any): state is SolarInverterState => {
  return typeof state === 'object' && typeof state.powerOutput === 'number';
};

export const isBatteryPackState = (state: any): state is BatteryPackState => {
  return typeof state === 'object' && typeof state.chargeLevel === 'number';
};

// Device Grid Filter for UI
export interface DeviceGridFilter {
  search?: string;
  deviceType?: DeviceType;
  status?: DeviceStatus;
  room?: string;
  floor?: string;
  building?: string;
  isOnline?: boolean;
  energyRole?: EnergyRole;
  sortBy?: 'name' | 'type' | 'lastSeen' | 'energyConsumption';
  sortOrder?: 'asc' | 'desc';
}