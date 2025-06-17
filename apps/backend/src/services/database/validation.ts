import { z } from 'zod';
import {
  UserSchema,
  DeviceSchema,
  DeviceCommandSchema,
  ScheduleSchema,
  AlertConfigSchema,
  DeviceCapabilitySchema,
  DeviceSpecificationsSchema
} from '@maestro/shared/types';
import { ValidationError } from '@/utils/errors';
import logger from '@/config/logger';

/**
 * Database Validation Service
 * 
 * Provides Zod-based validation schemas for database operations
 * to ensure data integrity before saving to MongoDB.
 */

/**
 * User Validation Schemas
 */
export const CreateUserValidation = z.object({
  email: z.string().email().min(1).max(255),
  displayName: z.string().min(2).max(50),
  role: z.enum(['user', 'admin', 'installer', 'energy_manager']).default('user'),
  profile: z.object({
    firstName: z.string().max(50).optional(),
    lastName: z.string().max(50).optional(),
    avatar: z.string().url().optional(),
    timezone: z.string().default('UTC'),
    language: z.string().default('en'),
    country: z.string().max(2).optional(),
    phoneNumber: z.string().max(20).optional()
  }).optional()
});

export const UpdateUserValidation = z.object({
  displayName: z.string().min(2).max(50).optional(),
  profile: z.object({
    firstName: z.string().max(50).optional(),
    lastName: z.string().max(50).optional(),
    avatar: z.string().url().optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
    country: z.string().max(2).optional(),
    phoneNumber: z.string().max(20).optional()
  }).optional(),
  settings: z.object({
    theme: z.enum(['light', 'dark', 'auto']).optional(),
    dashboardLayout: z.enum(['grid', 'list', 'compact']).optional(),
    defaultView: z.enum(['dashboard', 'devices', 'energy', 'settings']).optional(),
    pushNotifications: z.boolean().optional(),
    emailNotifications: z.boolean().optional(),
    smsNotifications: z.boolean().optional()
  }).optional()
});

/**
 * Device Validation Schemas
 */
export const CreateDeviceValidation = z.object({
  deviceId: z.string().min(1).max(100),
  protocol: z.enum(['tuya', 'modbus', 'mqtt', 'sunspec', 'can_bus', 'rest_api', 'local_network']),
  deviceType: z.enum(['smart_plug', 'solar_inverter', 'battery_pack', 'energy_meter', 'heat_pump', 'ev_charger']),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  room: z.string().max(50).optional(),
  floor: z.string().max(20).optional(),
  building: z.string().max(50).optional(),
  specifications: DeviceSpecificationsSchema,
  capabilities: z.array(DeviceCapabilitySchema).min(1),
  energyRole: z.enum(['consumer', 'producer', 'storage', 'bidirectional', 'monitor']).optional()
});

export const UpdateDeviceValidation = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  room: z.string().max(50).optional(),
  floor: z.string().max(20).optional(),
  building: z.string().max(50).optional(),
  specifications: DeviceSpecificationsSchema.partial().optional(),
  capabilities: z.array(DeviceCapabilitySchema).optional(),
  energyRole: z.enum(['consumer', 'producer', 'storage', 'bidirectional', 'monitor']).optional(),
  settings: z.object({
    autoControl: z.boolean().optional(),
    energyOptimization: z.boolean().optional(),
    loadPriority: z.number().min(1).max(10).optional(),
    maxPowerDraw: z.number().min(0).optional(),
    customProperties: z.record(z.any()).optional()
  }).optional()
});

export const DeviceStateValidation = z.record(z.any());

/**
 * Device Command Validation Schemas
 */
export const CreateDeviceCommandValidation = z.object({
  deviceId: z.string().min(1),
  command: z.string().min(1).max(100),
  parameters: z.record(z.any()).default({}),
  scheduledAt: z.date().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  maxRetries: z.number().min(0).max(10).default(3),
  source: z.enum(['user', 'automation', 'schedule', 'system', 'api']).default('user'),
  sourceDetails: z.record(z.any()).optional(),
  tags: z.array(z.string()).default([]),
  correlationId: z.string().optional(),
  batchId: z.string().optional()
});

/**
 * Schedule Validation Schemas
 */
export const CreateScheduleValidation = ScheduleSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  id: z.string().min(1).max(50)
});

export const UpdateScheduleValidation = ScheduleSchema.partial().omit({ 
  id: true, 
  createdAt: true 
});

/**
 * Alert Configuration Validation Schemas
 */
export const CreateAlertValidation = AlertConfigSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  id: z.string().min(1).max(50)
});

export const UpdateAlertValidation = AlertConfigSchema.partial().omit({ 
  id: true, 
  createdAt: true 
});

/**
 * Energy Measurement Validation Schemas
 */
export const CreateEnergyMeasurementValidation = z.object({
  deviceId: z.string().min(1),
  timestamp: z.date().default(() => new Date()),
  measurements: z.object({
    activePower: z.number().min(-100000).max(100000).optional(),
    reactivePower: z.number().min(-100000).max(100000).optional(),
    apparentPower: z.number().min(0).max(100000).optional(),
    powerFactor: z.number().min(-1).max(1).optional(),
    voltage: z.number().min(0).max(1000).optional(),
    current: z.number().min(0).max(1000).optional(),
    frequency: z.number().min(40).max(70).optional(),
    energy: z.number().min(0).optional(),
    energyConsumed: z.number().min(0).optional(),
    energyProduced: z.number().min(0).optional(),
    temperature: z.number().min(-50).max(150).optional(),
    humidity: z.number().min(0).max(100).optional(),
    batteryLevel: z.number().min(0).max(100).optional(),
    solarIrradiance: z.number().min(0).max(2000).optional(),
    efficiency: z.number().min(0).max(1).optional(),
    quality: z.enum(['good', 'fair', 'poor', 'unknown']).default('unknown'),
    confidence: z.number().min(0).max(1).default(1)
  }),
  source: z.enum(['device', 'calculated', 'estimated', 'manual']).default('device'),
  tags: z.record(z.string()).optional()
});

/**
 * User Preferences Validation Schemas
 */
export const UpdateUserPreferencesValidation = z.object({
  ui: z.object({
    theme: z.enum(['light', 'dark', 'auto']).optional(),
    language: z.string().optional(),
    timezone: z.string().optional(),
    dateFormat: z.string().optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
    temperatureUnit: z.enum(['celsius', 'fahrenheit']).optional(),
    energyUnit: z.enum(['kWh', 'MWh', 'BTU']).optional(),
    powerUnit: z.enum(['W', 'kW', 'MW']).optional(),
    currencySymbol: z.string().optional(),
    numberFormat: z.enum(['US', 'EU', 'UK']).optional(),
    compactMode: z.boolean().optional(),
    animationsEnabled: z.boolean().optional(),
    accessibilityMode: z.boolean().optional()
  }).optional(),
  notifications: z.object({
    email: z.object({
      enabled: z.boolean().optional(),
      frequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']).optional(),
      categories: z.array(z.string()).optional()
    }).optional(),
    push: z.object({
      enabled: z.boolean().optional(),
      categories: z.array(z.string()).optional(),
      sound: z.boolean().optional(),
      vibration: z.boolean().optional()
    }).optional(),
    deviceAlerts: z.boolean().optional(),
    energyAlerts: z.boolean().optional(),
    systemNotifications: z.boolean().optional()
  }).optional(),
  energy: z.object({
    tariffStructure: z.enum(['fixed', 'time_of_use', 'real_time', 'tiered']).optional(),
    energyProvider: z.string().optional(),
    currency: z.string().optional(),
    fixedRate: z.number().min(0).optional(),
    optimizationMode: z.enum(['cost', 'carbon', 'comfort', 'performance', 'custom']).optional(),
    autoOptimization: z.boolean().optional(),
    loadShifting: z.boolean().optional(),
    monthlyBudget: z.number().min(0).optional(),
    dailyBudget: z.number().min(0).optional()
  }).optional(),
  devices: z.object({
    defaultSettings: z.object({
      autoDiscovery: z.boolean().optional(),
      autoControl: z.boolean().optional(),
      energyMonitoring: z.boolean().optional(),
      schedulingEnabled: z.boolean().optional(),
      alertsEnabled: z.boolean().optional()
    }).optional(),
    display: z.object({
      showOfflineDevices: z.boolean().optional(),
      showEnergyConsumption: z.boolean().optional(),
      sortBy: z.enum(['name', 'type', 'room', 'lastSeen', 'energyUsage']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      viewMode: z.enum(['grid', 'list', 'compact']).optional()
    }).optional()
  }).optional(),
  privacy: z.object({
    dataRetention: z.object({
      energyData: z.number().min(1).max(3650).optional(), // days
      commandHistory: z.number().min(1).max(365).optional(),
      activityLogs: z.number().min(1).max(90).optional()
    }).optional(),
    sharing: z.object({
      anonymousAnalytics: z.boolean().optional(),
      performanceMetrics: z.boolean().optional(),
      crashReporting: z.boolean().optional()
    }).optional(),
    security: z.object({
      twoFactorAuth: z.boolean().optional(),
      sessionTimeout: z.number().min(5).max(1440).optional(), // minutes
      requirePasswordForSensitiveActions: z.boolean().optional()
    }).optional()
  }).optional()
});

/**
 * Query Parameters Validation Schemas
 */
export const PaginationValidation = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20)
});

export const SortValidation = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).default('desc')
});

export const QueryFiltersValidation = z.object({
  search: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  type: z.string().max(50).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

/**
 * Validation Helper Functions
 */

/**
 * Validate data against a Zod schema
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      const contextMsg = context ? ` in ${context}` : '';
      throw new ValidationError(`Validation failed${contextMsg}: ${errorMessages}`, {
        details: error.errors
      });
    }
    throw error;
  }
}

/**
 * Validate and sanitize user input
 */
export function validateAndSanitize<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const validated = validateData(schema, data, context);
  
  // Additional sanitization if needed
  if (typeof validated === 'object' && validated !== null) {
    return sanitizeObject(validated);
  }
  
  return validated;
}

/**
 * Sanitize object by trimming strings and removing nullish values
 */
function sanitizeObject<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as T;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized = {} as T;
    
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'string') {
          (sanitized as any)[key] = value.trim();
        } else if (typeof value === 'object') {
          (sanitized as any)[key] = sanitizeObject(value);
        } else {
          (sanitized as any)[key] = value;
        }
      }
    }
    
    return sanitized;
  }
  
  return obj;
}

/**
 * Validate ObjectId format
 */
export function validateObjectId(id: string, context?: string): string {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  
  if (!objectIdRegex.test(id)) {
    const contextMsg = context ? ` for ${context}` : '';
    throw new ValidationError(`Invalid ObjectId format${contextMsg}`);
  }
  
  return id;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): string {
  const emailSchema = z.string().email();
  return validateData(emailSchema, email, 'email validation');
}

/**
 * Validate date range
 */
export function validateDateRange(startDate: Date, endDate: Date): void {
  if (startDate >= endDate) {
    throw new ValidationError('Start date must be before end date');
  }
  
  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
  if (endDate.getTime() - startDate.getTime() > maxRange) {
    throw new ValidationError('Date range cannot exceed 1 year');
  }
}

/**
 * Validation middleware factory
 */
export function createValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  context?: string
) {
  return (req: any, res: any, next: any) => {
    try {
      req.validatedData = validateAndSanitize(schema, req.body, context);
      next();
    } catch (error) {
      logger.error('Validation middleware error', { error, context });
      next(error);
    }
  };
}

/**
 * Query validation middleware factory
 */
export function createQueryValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  context?: string
) {
  return (req: any, res: any, next: any) => {
    try {
      req.validatedQuery = validateAndSanitize(schema, req.query, context);
      next();
    } catch (error) {
      logger.error('Query validation middleware error', { error, context });
      next(error);
    }
  };
}

/**
 * Parameter validation middleware factory
 */
export function createParamValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  context?: string
) {
  return (req: any, res: any, next: any) => {
    try {
      req.validatedParams = validateAndSanitize(schema, req.params, context);
      next();
    } catch (error) {
      logger.error('Parameter validation middleware error', { error, context });
      next(error);
    }
  };
}

export default {
  // Schemas
  CreateUserValidation,
  UpdateUserValidation,
  CreateDeviceValidation,
  UpdateDeviceValidation,
  DeviceStateValidation,
  CreateDeviceCommandValidation,
  CreateScheduleValidation,
  UpdateScheduleValidation,
  CreateAlertValidation,
  UpdateAlertValidation,
  CreateEnergyMeasurementValidation,
  UpdateUserPreferencesValidation,
  PaginationValidation,
  SortValidation,
  QueryFiltersValidation,
  
  // Functions
  validateData,
  validateAndSanitize,
  validateObjectId,
  validateEmail,
  validateDateRange,
  createValidationMiddleware,
  createQueryValidationMiddleware,
  createParamValidationMiddleware
};