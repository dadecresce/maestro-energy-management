import { z } from 'zod';

// Base types for the Maestro Energy Management System

export type ObjectId = string;

// Device Types (MVP + Future)
export const DeviceType = z.enum([
  'smart_plug',
  'solar_inverter',    // Phase 2
  'battery_pack',      // Phase 2
  'energy_meter',      // Phase 2
  'heat_pump',         // Phase 3
  'ev_charger'         // Phase 3
]);

export type DeviceType = z.infer<typeof DeviceType>;

// Protocol Types
export const ProtocolType = z.enum([
  'tuya',              // MVP
  'modbus',            // Phase 2
  'mqtt',              // Phase 2
  'sunspec',           // Phase 2 (Solar)
  'can_bus',           // Phase 2 (Battery)
  'rest_api',          // Generic HTTP API
  'local_network'      // Direct network communication
]);

export type ProtocolType = z.infer<typeof ProtocolType>;

// Energy Role Classification (Phase 2)
export const EnergyRole = z.enum([
  'consumer',          // Consumes energy (smart plugs, appliances)
  'producer',          // Produces energy (solar panels, wind)
  'storage',           // Stores energy (batteries)
  'bidirectional',     // Can consume or produce (inverters, EVs)
  'monitor'            // Only monitors (smart meters)
]);

export type EnergyRole = z.infer<typeof EnergyRole>;

// Device Capability Types
export const CapabilityType = z.enum([
  // Basic Controls
  'switch',            // On/Off control
  'dimmer',            // Brightness control
  'color',             // Color control
  'thermostat',        // Temperature control
  
  // Monitoring
  'energy_meter',      // Energy consumption monitoring
  'temperature_sensor',
  'humidity_sensor',
  'motion_sensor',
  
  // Scheduling
  'scheduler',         // Timer and schedule support
  'automation',        // Rule-based automation
  
  // Advanced (Phase 2)
  'power_control',     // Variable power output
  'energy_storage',    // Battery charge/discharge
  'grid_interaction',  // Grid tie functionality
  'load_balancing'     // Smart load management
]);

export type CapabilityType = z.infer<typeof CapabilityType>;

// Authentication Types
export const AuthProvider = z.enum([
  'tuya',
  'google',            // Future
  'apple',             // Future
  'local'              // Local account
]);

export type AuthProvider = z.infer<typeof AuthProvider>;

// User Role Types
export const UserRole = z.enum([
  'user',              // Regular user
  'admin',             // System administrator
  'installer',         // Professional installer (Phase 2)
  'energy_manager'     // Energy management specialist (Phase 2)
]);

export type UserRole = z.infer<typeof UserRole>;

// Command Status
export const CommandStatus = z.enum([
  'pending',
  'executing',
  'completed',
  'failed',
  'timeout',
  'cancelled'
]);

export type CommandStatus = z.infer<typeof CommandStatus>;

// Device Status
export const DeviceStatus = z.enum([
  'online',
  'offline',
  'unknown',
  'error',
  'maintenance'
]);

export type DeviceStatus = z.infer<typeof DeviceStatus>;

// Energy Units
export const EnergyUnit = z.enum([
  'W',                 // Watts (power)
  'kW',                // Kilowatts
  'MW',                // Megawatts
  'Wh',                // Watt-hours (energy)
  'kWh',               // Kilowatt-hours
  'MWh',               // Megawatt-hours
  'V',                 // Volts
  'A',                 // Amperes
  'Hz',                // Hertz (frequency)
  'pf'                 // Power factor
]);

export type EnergyUnit = z.infer<typeof EnergyUnit>;

// Time-based Types
export const TimeRange = z.object({
  start: z.date(),
  end: z.date()
});

export type TimeRange = z.infer<typeof TimeRange>;

export const RecurrencePattern = z.enum([
  'once',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom'
]);

export type RecurrencePattern = z.infer<typeof RecurrencePattern>;

// Validation helpers
export const isValidObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export const isValidEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

// Type guards
export const isDeviceType = (value: unknown): value is DeviceType => {
  return DeviceType.safeParse(value).success;
};

export const isProtocolType = (value: unknown): value is ProtocolType => {
  return ProtocolType.safeParse(value).success;
};

export const isEnergyRole = (value: unknown): value is EnergyRole => {
  return EnergyRole.safeParse(value).success;
};