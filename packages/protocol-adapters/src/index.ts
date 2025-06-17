// Protocol Adapters Library for Maestro Energy Management System

// Base classes and interfaces
export * from './base/adapter';
export * from './base/manager';

// Tuya adapter (MVP)
export * from './tuya/adapter';

// Future adapters (Phase 2)
// export * from './modbus/adapter';
// export * from './mqtt/adapter';

// Utility functions
export * from './utils/discovery';
export * from './utils/validation';

// Re-export shared types for convenience
export {
  ProtocolType,
  DeviceType,
  DeviceCommand,
  CommandResult,
  DeviceStatusUpdate,
  DeviceDiscovery
} from '@maestro/shared/types';

// Default configurations for different protocols
export const DEFAULT_CONFIGS = {
  tuya: {
    protocol: 'tuya' as const,
    name: 'Tuya Cloud Adapter',
    enabled: true,
    connectionTimeout: 10000,
    commandTimeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
    maxConcurrentCommands: 10,
    rateLimiting: {
      requestsPerSecond: 10,
      burstSize: 20
    },
    authentication: {
      baseUrl: 'https://openapi.tuyaeu.com',
      region: 'eu' as const
    },
    options: {
      pollingInterval: 30000,
      enableWebhooks: false,
      maxDevicesPerRequest: 100,
      cacheTTL: 300000 // 5 minutes
    }
  },
  
  modbus: {
    protocol: 'modbus' as const,
    name: 'Modbus TCP Adapter',
    enabled: false, // Phase 2
    connectionTimeout: 5000,
    commandTimeout: 3000,
    retryAttempts: 3,
    retryDelay: 500,
    maxConcurrentCommands: 5,
    options: {
      host: '192.168.1.100',
      port: 502,
      unitId: 1,
      timeout: 3000,
      reconnectInterval: 5000
    }
  },
  
  mqtt: {
    protocol: 'mqtt' as const,
    name: 'MQTT Adapter',
    enabled: false, // Phase 2
    connectionTimeout: 5000,
    commandTimeout: 3000,
    retryAttempts: 3,
    retryDelay: 1000,
    maxConcurrentCommands: 20,
    options: {
      brokerUrl: 'mqtt://localhost:1883',
      keepAlive: 60,
      reconnectPeriod: 1000,
      qos: 1,
      topicPrefix: 'maestro'
    }
  }
} as const;