/**
 * Model Exports for Maestro Energy Management System
 * 
 * This file exports all Mongoose models and their types for use throughout the application.
 * Models are designed to be future-ready for Phase 2 expansions while supporting MVP requirements.
 */

// User models
export { 
  User, 
  UserSchema,
  type IUserDocument 
} from './User';

export { 
  Session, 
  SessionSchema,
  type ISessionDocument 
} from './Session';

export { 
  UserPreferences, 
  UserPreferencesSchema,
  type IUserPreferencesDocument,
  type DashboardWidget,
  type DashboardLayout,
  type NotificationPreferences,
  type EnergyPreferences,
  type DevicePreferences,
  type PrivacyPreferences
} from './UserPreferences';

// Device models
export { 
  Device, 
  DeviceSchema,
  type IDeviceDocument 
} from './Device';

export { 
  DeviceCommand, 
  DeviceCommandSchema,
  type IDeviceCommandDocument 
} from './DeviceCommand';

// Energy models (Phase 2 ready)
export { 
  EnergyMeasurement,
  EnergyFlow,
  EnergyStats,
  EnergyMeasurementSchema,
  EnergyFlowSchema,
  EnergyStatsSchema,
  type IEnergyMeasurementDocument,
  type IEnergyFlowDocument,
  type IEnergyStatsDocument
} from './EnergyMeasurement';

/**
 * Model Registry for dynamic access
 */
export const ModelRegistry = {
  User,
  Session,
  UserPreferences,
  Device,
  DeviceCommand,
  EnergyMeasurement,
  EnergyFlow,
  EnergyStats
} as const;

/**
 * Model Names for consistent reference
 */
export const ModelNames = {
  USER: 'User',
  SESSION: 'Session',
  USER_PREFERENCES: 'UserPreferences',
  DEVICE: 'Device',
  DEVICE_COMMAND: 'DeviceCommand',
  ENERGY_MEASUREMENT: 'EnergyMeasurement',
  ENERGY_FLOW: 'EnergyFlow',
  ENERGY_STATS: 'EnergyStats'
} as const;

/**
 * Collection Names for direct MongoDB operations
 */
export const CollectionNames = {
  USERS: 'users',
  SESSIONS: 'sessions',
  USER_PREFERENCES: 'userpreferences',
  DEVICES: 'devices',
  DEVICE_COMMANDS: 'devicecommands',
  ENERGY_MEASUREMENTS: 'energymeasurements',
  ENERGY_FLOWS: 'energyflows',
  ENERGY_STATS: 'energystats'
} as const;

/**
 * Type definitions for all document types
 */
export type DocumentTypes = {
  User: IUserDocument;
  Session: ISessionDocument;
  UserPreferences: IUserPreferencesDocument;
  Device: IDeviceDocument;
  DeviceCommand: IDeviceCommandDocument;
  EnergyMeasurement: IEnergyMeasurementDocument;
  EnergyFlow: IEnergyFlowDocument;
  EnergyStats: IEnergyStatsDocument;
};

/**
 * Utility type for getting document type by model name
 */
export type GetDocumentType<T extends keyof DocumentTypes> = DocumentTypes[T];

/**
 * All available models as a union type
 */
export type AllModels = typeof ModelRegistry[keyof typeof ModelRegistry];

/**
 * Export default for convenient importing
 */
export default ModelRegistry;