import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from '@/utils/errors';
import logger from '@/config/logger';

/**
 * Validation target types
 */
type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

/**
 * Validation schema map
 */
interface ValidationSchemas {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  headers?: Joi.ObjectSchema;
}

/**
 * Validation options
 */
interface ValidationOptions {
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

/**
 * Create validation middleware using Joi schemas
 */
export const validate = (
  schemas: ValidationSchemas,
  options: ValidationOptions = {}
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const defaultOptions = {
      allowUnknown: false,
      stripUnknown: true,
      abortEarly: false,
      ...options,
    };

    const errors: Record<string, any> = {};

    // Validate each specified schema
    for (const [target, schema] of Object.entries(schemas)) {
      if (schema) {
        const targetData = req[target as keyof Request];
        const { error, value } = schema.validate(targetData, defaultOptions);

        if (error) {
          errors[target] = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value,
          }));
        } else {
          // Replace the original data with validated/sanitized data
          (req as any)[target] = value;
        }
      }
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      logger.warn('Validation failed', {
        url: req.url,
        method: req.method,
        errors,
        requestId: req.requestId,
      });

      throw new ApiError(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        { validationErrors: errors }
      );
    }

    next();
  };
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // MongoDB ObjectId validation
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
    'string.pattern.base': 'Invalid ObjectId format'
  }),
  
  // UUID validation
  uuid: Joi.string().uuid().messages({
    'string.guid': 'Invalid UUID format'
  }),
  
  // Email validation
  email: Joi.string().email().messages({
    'string.email': 'Invalid email format'
  }),
  
  // Password validation (strong password)
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .messages({
      'string.pattern.base': 'Password must be 8-128 characters with at least one lowercase, uppercase, digit, and special character'
    }),
  
  // Date validation
  date: Joi.date().iso().messages({
    'date.format': 'Invalid ISO date format'
  }),
  
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
  
  // Search filters
  searchFilters: Joi.object({
    search: Joi.string().min(1).max(100).optional(),
    status: Joi.string().optional(),
    type: Joi.string().optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().optional(),
  }),
};

/**
 * Device-related validation schemas
 */
// Device ID validation schema
const deviceIdSchema = Joi.string().min(5).max(50).alphanum().messages({
  'string.alphanum': 'Invalid device ID format'
});

export const deviceSchemas = {
  // Device ID validation
  deviceId: deviceIdSchema,
  
  // Device creation/update
  createDevice: Joi.object({
    deviceId: deviceIdSchema.required(),
    protocol: Joi.string().valid('tuya', 'modbus', 'mqtt').required(),
    deviceType: Joi.string().valid('smart_plug', 'solar_inverter', 'battery_pack').required(),
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    location: Joi.string().max(100).optional(),
    room: Joi.string().max(50).optional(),
    floor: Joi.string().max(20).optional(),
    building: Joi.string().max(50).optional(),
    specifications: Joi.object({
      manufacturer: Joi.string().max(50).required(),
      model: Joi.string().max(100).required(),
      firmwareVersion: Joi.string().max(20).optional(),
      hardwareVersion: Joi.string().max(20).optional(),
      maxPower: Joi.number().positive().optional(),
      capacity: Joi.number().positive().optional(),
      voltage: Joi.number().positive().optional(),
      frequency: Joi.number().positive().optional(),
      phases: Joi.number().integer().min(1).max(3).default(1),
      certifications: Joi.array().items(Joi.string()).default([]),
    }).required(),
  }),
  
  // Device command
  deviceCommand: Joi.object({
    command: Joi.string().min(1).max(50).required(),
    parameters: Joi.object().default({}),
  }),
  
  // Device update
  updateDevice: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(500).optional(),
    location: Joi.string().max(100).optional(),
    room: Joi.string().max(50).optional(),
    floor: Joi.string().max(20).optional(),
    building: Joi.string().max(50).optional(),
    settings: Joi.object({
      autoControl: Joi.boolean().optional(),
      energyOptimization: Joi.boolean().optional(),
      loadPriority: Joi.number().integer().min(1).max(10).optional(),
      maxPowerDraw: Joi.number().positive().optional(),
    }).optional(),
  }),
};

/**
 * User-related validation schemas
 */
export const userSchemas = {
  // User registration
  register: Joi.object({
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    timezone: Joi.string().max(50).default('UTC'),
  }),
  
  // User login
  login: Joi.object({
    email: commonSchemas.email.required(),
    password: Joi.string().min(1).required(),
    rememberMe: Joi.boolean().default(false),
  }),
  
  // User profile update
  updateProfile: Joi.object({
    firstName: Joi.string().min(1).max(50).optional(),
    lastName: Joi.string().min(1).max(50).optional(),
    timezone: Joi.string().max(50).optional(),
    preferences: Joi.object({
      theme: Joi.string().valid('light', 'dark', 'auto').optional(),
      language: Joi.string().length(2).optional(),
      notifications: Joi.object({
        email: Joi.boolean().optional(),
        push: Joi.boolean().optional(),
        sms: Joi.boolean().optional(),
      }).optional(),
    }).optional(),
  }),
  
  // Password change
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required(),
  }),
  
  // Password reset request
  resetPasswordRequest: Joi.object({
    email: commonSchemas.email.required(),
  }),
  
  // Password reset
  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: commonSchemas.password.required(),
  }),
};

/**
 * API-related validation schemas
 */
export const apiSchemas = {
  // Generic response
  response: Joi.object({
    success: Joi.boolean().required(),
    data: Joi.any().optional(),
    error: Joi.string().optional(),
    message: Joi.string().optional(),
    timestamp: Joi.date().iso().required(),
    requestId: Joi.string().optional(),
  }),
  
  // Pagination parameters
  paginationQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().max(100).optional(),
  }),
  
  // Bulk operations
  bulkIds: Joi.object({
    ids: Joi.array().items(commonSchemas.objectId).min(1).max(100).required(),
  }),
};

/**
 * Auth-related validation schemas
 */
export const authSchemas = {
  // JWT token
  jwtToken: Joi.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/).required(),
  
  // Tuya OAuth
  tuyaCallback: Joi.object({
    code: Joi.string().required(),
    state: Joi.string().optional(),
  }),
};

/**
 * Validation middleware factory functions
 */
export const validateBody = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validate({ body: schema }, options);

export const validateQuery = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validate({ query: schema }, options);

export const validateParams = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validate({ params: schema }, options);

export const validateHeaders = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
  validate({ headers: schema }, options);

/**
 * Common validation middleware instances
 */
export const validatePagination = validateQuery(apiSchemas.paginationQuery);

export const validateObjectId = (paramName: string = 'id') =>
  validateParams(Joi.object({
    [paramName]: commonSchemas.objectId.required(),
  }));

export const validateDeviceId = (paramName: string = 'deviceId') =>
  validateParams(Joi.object({
    [paramName]: deviceSchemas.deviceId.required(),
  }));

/**
 * Custom validation functions
 */
export const customValidators = {
  /**
   * Validate that a date is not in the future
   */
  pastDate: (value: any, helpers: Joi.CustomHelpers) => {
    if (new Date(value) > new Date()) {
      return helpers.error('any.custom', { message: 'Date cannot be in the future' });
    }
    return value;
  },

  /**
   * Validate that end date is after start date
   */
  dateRange: (value: any, helpers: Joi.CustomHelpers) => {
    const { dateFrom, dateTo } = helpers.state.ancestors[0];
    if (dateFrom && dateTo && new Date(dateTo) <= new Date(dateFrom)) {
      return helpers.error('any.custom', { message: 'End date must be after start date' });
    }
    return value;
  },

  /**
   * Validate device capabilities based on device type
   */
  deviceCapabilities: (value: any, helpers: Joi.CustomHelpers) => {
    const deviceType = helpers.state.ancestors[0].deviceType;
    const validCapabilities: Record<string, string[]> = {
      smart_plug: ['switch', 'energy_meter', 'scheduler'],
      solar_inverter: ['energy_generator', 'inverter_stats', 'grid_tie'],
      battery_pack: ['battery_monitor', 'charge_controller', 'energy_storage'],
    };

    if (deviceType && validCapabilities[deviceType]) {
      const allowedCapabilities = validCapabilities[deviceType];
      const invalidCapabilities = value.filter((cap: string) => !allowedCapabilities.includes(cap));
      
      if (invalidCapabilities.length > 0) {
        return helpers.error('any.custom', {
          message: `Invalid capabilities for ${deviceType}: ${invalidCapabilities.join(', ')}`,
        });
      }
    }

    return value;
  },
};

/**
 * Sanitization helpers
 */
export const sanitizers = {
  /**
   * Sanitize HTML input (strip HTML tags)
   */
  stripHtml: (value: string): string => {
    return value.replace(/<[^>]*>/g, '');
  },

  /**
   * Normalize email address
   */
  normalizeEmail: (email: string): string => {
    return email.toLowerCase().trim();
  },

  /**
   * Sanitize device name (remove special characters except allowed ones)
   */
  sanitizeDeviceName: (name: string): string => {
    return name.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim();
  },
};

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validatePagination,
  validateObjectId,
  validateDeviceId,
  commonSchemas,
  deviceSchemas,
  userSchemas,
  apiSchemas,
  authSchemas,
  customValidators,
  sanitizers,
};