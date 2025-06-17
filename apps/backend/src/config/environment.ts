import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

/**
 * Environment Configuration Schema
 * Validates all required environment variables using Joi
 */
const envSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number()
    .default(3001),
  HOST: Joi.string()
    .default('0.0.0.0'),
  
  // Security
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .description('JWT secret key (must be at least 32 characters)'),
  JWT_EXPIRES_IN: Joi.string()
    .default('24h'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .default('7d'),
  SESSION_SECRET: Joi.string()
    .min(32)
    .default('change-this-in-production'),
  
  // Database - MongoDB
  MONGODB_URI: Joi.string()
    .uri()
    .required()
    .description('MongoDB connection URI'),
  MONGODB_DB_NAME: Joi.string()
    .default('maestro'),
  
  // Cache - Redis
  REDIS_URL: Joi.string()
    .uri()
    .required()
    .description('Redis connection URL'),
  REDIS_PASSWORD: Joi.string()
    .allow(''),
  REDIS_DB: Joi.number()
    .min(0)
    .max(15)
    .default(0),
  
  // Tuya Cloud API
  TUYA_CLIENT_ID: Joi.string()
    .required()
    .description('Tuya Cloud API Client ID'),
  TUYA_CLIENT_SECRET: Joi.string()
    .required()
    .description('Tuya Cloud API Client Secret'),
  TUYA_REDIRECT_URI: Joi.string()
    .uri()
    .required()
    .description('OAuth redirect URI for Tuya'),
  TUYA_BASE_URL: Joi.string()
    .uri()
    .default('https://openapi.tuyaeu.com'),
  TUYA_REGION: Joi.string()
    .valid('us', 'eu', 'cn', 'in')
    .default('eu'),
  
  // API Configuration
  API_RATE_LIMIT_WINDOW_MS: Joi.number()
    .default(15 * 60 * 1000), // 15 minutes
  API_RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .default(100),
  API_REQUEST_TIMEOUT: Joi.number()
    .default(30000), // 30 seconds
  API_MAX_REQUEST_SIZE: Joi.string()
    .default('10mb'),
  
  // CORS Configuration
  CORS_ORIGIN: Joi.string()
    .default('http://localhost:3000'),
  CORS_CREDENTIALS: Joi.boolean()
    .default(true),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),
  LOG_FILE_ENABLED: Joi.boolean()
    .default(true),
  LOG_MAX_SIZE: Joi.string()
    .default('20m'),
  LOG_MAX_FILES: Joi.string()
    .default('14d'),
  
  // WebSocket
  WS_ENABLED: Joi.boolean()
    .default(true),
  WS_PORT: Joi.number()
    .default(3002),
  WS_PING_TIMEOUT: Joi.number()
    .default(60000),
  WS_PING_INTERVAL: Joi.number()
    .default(25000),
  
  // Device Management
  DEVICE_POLLING_INTERVAL: Joi.number()
    .default(30000), // 30 seconds
  DEVICE_COMMAND_TIMEOUT: Joi.number()
    .default(10000), // 10 seconds
  DEVICE_MAX_RETRIES: Joi.number()
    .default(3),
  
  // Caching
  CACHE_TTL_DEVICE_STATUS: Joi.number()
    .default(30), // 30 seconds
  CACHE_TTL_DEVICE_LIST: Joi.number()
    .default(300), // 5 minutes
  CACHE_TTL_USER_PROFILE: Joi.number()
    .default(3600), // 1 hour
  
  // Health Check
  HEALTH_CHECK_ENABLED: Joi.boolean()
    .default(true),
  HEALTH_CHECK_INTERVAL: Joi.number()
    .default(30000), // 30 seconds
  
  // Development
  ENABLE_REQUEST_LOGGING: Joi.boolean()
    .default(true),
  ENABLE_SWAGGER: Joi.boolean()
    .default(true),
  ENABLE_PLAYGROUND: Joi.boolean()
    .default(false),
}).unknown();

/**
 * Validate environment variables
 */
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

/**
 * Typed environment configuration
 */
export interface EnvironmentConfig {
  // Application
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  
  // Security
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  session: {
    secret: string;
  };
  
  // Database
  mongodb: {
    uri: string;
    dbName: string;
  };
  
  // Cache
  redis: {
    url: string;
    password?: string;
    db: number;
  };
  
  // Tuya
  tuya: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    baseUrl: string;
    region: 'us' | 'eu' | 'cn' | 'in';
  };
  
  // API
  api: {
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
    requestTimeout: number;
    maxRequestSize: string;
  };
  
  // CORS
  cors: {
    origin: string;
    credentials: boolean;
  };
  
  // Logging
  logging: {
    level: string;
    fileEnabled: boolean;
    maxSize: string;
    maxFiles: string;
  };
  
  // WebSocket
  websocket: {
    enabled: boolean;
    port: number;
    pingTimeout: number;
    pingInterval: number;
  };
  
  // Device Management
  devices: {
    pollingInterval: number;
    commandTimeout: number;
    maxRetries: number;
  };
  
  // Caching
  cache: {
    ttl: {
      deviceStatus: number;
      deviceList: number;
      userProfile: number;
    };
  };
  
  // Health Check
  healthCheck: {
    enabled: boolean;
    interval: number;
  };
  
  // Development
  development: {
    enableRequestLogging: boolean;
    enableSwagger: boolean;
    enablePlayground: boolean;
  };
}

/**
 * Parsed and typed environment configuration
 */
export const config: EnvironmentConfig = {
  // Application
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  host: envVars.HOST,
  isProduction: envVars.NODE_ENV === 'production',
  isDevelopment: envVars.NODE_ENV === 'development',
  isTest: envVars.NODE_ENV === 'test',
  
  // Security
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
  },
  session: {
    secret: envVars.SESSION_SECRET,
  },
  
  // Database
  mongodb: {
    uri: envVars.MONGODB_URI,
    dbName: envVars.MONGODB_DB_NAME,
  },
  
  // Cache
  redis: {
    url: envVars.REDIS_URL,
    password: envVars.REDIS_PASSWORD || undefined,
    db: envVars.REDIS_DB,
  },
  
  // Tuya
  tuya: {
    clientId: envVars.TUYA_CLIENT_ID,
    clientSecret: envVars.TUYA_CLIENT_SECRET,
    redirectUri: envVars.TUYA_REDIRECT_URI,
    baseUrl: envVars.TUYA_BASE_URL,
    region: envVars.TUYA_REGION,
  },
  
  // API
  api: {
    rateLimit: {
      windowMs: envVars.API_RATE_LIMIT_WINDOW_MS,
      maxRequests: envVars.API_RATE_LIMIT_MAX_REQUESTS,
    },
    requestTimeout: envVars.API_REQUEST_TIMEOUT,
    maxRequestSize: envVars.API_MAX_REQUEST_SIZE,
  },
  
  // CORS
  cors: {
    origin: envVars.CORS_ORIGIN,
    credentials: envVars.CORS_CREDENTIALS,
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL,
    fileEnabled: envVars.LOG_FILE_ENABLED,
    maxSize: envVars.LOG_MAX_SIZE,
    maxFiles: envVars.LOG_MAX_FILES,
  },
  
  // WebSocket
  websocket: {
    enabled: envVars.WS_ENABLED,
    port: envVars.WS_PORT,
    pingTimeout: envVars.WS_PING_TIMEOUT,
    pingInterval: envVars.WS_PING_INTERVAL,
  },
  
  // Device Management
  devices: {
    pollingInterval: envVars.DEVICE_POLLING_INTERVAL,
    commandTimeout: envVars.DEVICE_COMMAND_TIMEOUT,
    maxRetries: envVars.DEVICE_MAX_RETRIES,
  },
  
  // Caching
  cache: {
    ttl: {
      deviceStatus: envVars.CACHE_TTL_DEVICE_STATUS,
      deviceList: envVars.CACHE_TTL_DEVICE_LIST,
      userProfile: envVars.CACHE_TTL_USER_PROFILE,
    },
  },
  
  // Health Check
  healthCheck: {
    enabled: envVars.HEALTH_CHECK_ENABLED,
    interval: envVars.HEALTH_CHECK_INTERVAL,
  },
  
  // Development
  development: {
    enableRequestLogging: envVars.ENABLE_REQUEST_LOGGING,
    enableSwagger: envVars.ENABLE_SWAGGER,
    enablePlayground: envVars.ENABLE_PLAYGROUND,
  },
};

/**
 * Get configuration value with optional default
 */
export function getConfig<K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] {
  return config[key];
}

/**
 * Check if running in production environment
 */
export function isProduction(): boolean {
  return config.isProduction;
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return config.isDevelopment;
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return config.isTest;
}

/**
 * Validate that all required configuration is present
 */
export function validateConfig(): void {
  const requiredFields = [
    'JWT_SECRET',
    'MONGODB_URI',
    'REDIS_URL',
    'TUYA_CLIENT_ID',
    'TUYA_CLIENT_SECRET',
    'TUYA_REDIRECT_URI',
  ];
  
  const missing = requiredFields.filter(field => !process.env[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Export default configuration
export default config;