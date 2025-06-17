// ============================================================================
// Core Application Types
// ============================================================================

// User and Authentication Types
export interface User {
  _id: string;
  tuyaUserId: string;
  username: string;
  email: string;
  countryCode: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile: UserProfile;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  avatar?: string;
  timezone?: string;
  language?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  uid: string;
}

// Device Types
export interface Device {
  _id: string;
  userId: string;
  deviceId: string;
  protocol: 'tuya' | 'modbus' | 'mqtt' | 'sunspec';
  deviceType: 'smart_plug' | 'solar_inverter' | 'battery_pack';
  capabilities: DeviceCapability[];
  energyRole?: 'consumer' | 'producer' | 'storage' | 'bidirectional';
  name: string;
  location?: string;
  specifications: DeviceSpecifications;
  isOnline: boolean;
  lastSeenAt: Date;
  settings: DeviceSettings;
  status: DeviceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceCapability {
  type: 'switch' | 'energy_meter' | 'scheduler' | 'dimmer' | 'temperature' | 'power_monitoring';
  properties: Record<string, any>;
  commands: string[];
}

export interface DeviceSpecifications {
  manufacturer: string;
  model: string;
  firmwareVersion?: string;
  maxPower?: number;        // Watts
  capacity?: number;        // For batteries: kWh
  voltage?: number;         // Volts
  phases?: number;          // For 3-phase devices
}

export interface DeviceSettings {
  autoControl: boolean;
  schedules: Schedule[];
  alerts: AlertConfig[];
  energyOptimization?: boolean;
}

export interface DeviceStatus {
  switch?: boolean;         // On/Off state
  online: boolean;
  signal?: number;          // Signal strength (0-100)
  energy?: EnergyData;
  temperature?: number;     // Celsius
  lastUpdate: Date;
}

export interface EnergyData {
  activePower?: number;     // Current power consumption/production (W)
  voltage?: number;         // Volts
  current?: number;         // Amperes
  frequency?: number;       // Hz
  powerFactor?: number;     // Power factor (0-1)
  energy?: number;          // Accumulated energy (kWh)
  energyToday?: number;     // Today's energy (kWh)
  energyMonth?: number;     // This month's energy (kWh)
}

// Energy Measurement Types (for Phase 2)
export interface EnergyMeasurement {
  deviceId: string;
  timestamp: Date;
  measurements: {
    activePower?: number;
    reactivePower?: number;
    apparentPower?: number;
    voltage?: number;
    current?: number;
    frequency?: number;
    powerFactor?: number;
    energy?: number;
    temperature?: number;
  };
}

// Scheduling Types
export interface Schedule {
  _id?: string;
  name: string;
  enabled: boolean;
  type: 'once' | 'daily' | 'weekly' | 'custom';
  actions: ScheduleAction[];
  conditions?: ScheduleCondition[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ScheduleAction {
  type: 'switch_on' | 'switch_off' | 'set_power' | 'notification';
  parameters?: Record<string, any>;
  delay?: number;           // Delay in seconds before action
}

export interface ScheduleCondition {
  type: 'time' | 'day_of_week' | 'energy_threshold' | 'device_status';
  operator: 'equals' | 'greater_than' | 'less_than' | 'between';
  value: any;
  secondValue?: any;        // For 'between' operator
}

// Alert Configuration
export interface AlertConfig {
  _id?: string;
  type: 'device_offline' | 'high_consumption' | 'low_battery' | 'maintenance_required';
  enabled: boolean;
  threshold?: number;
  notificationMethods: ('push' | 'email' | 'sms')[];
  cooldownMinutes: number;
}

// Command Types
export interface DeviceCommand {
  deviceId: string;
  command: string;
  parameters?: Record<string, any>;
  userId: string;
  timestamp: Date;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  timestamp: Date;
  executionTime?: number;   // milliseconds
}

// WebSocket Event Types
export interface WebSocketEvent {
  type: 'device_status_update' | 'device_online' | 'device_offline' | 'energy_update' | 'alert';
  payload: any;
  timestamp: Date;
  deviceId?: string;
  userId: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// UI State Types
export interface DeviceGridFilter {
  status?: 'online' | 'offline' | 'all';
  type?: string;
  location?: string;
  search?: string;
}

export interface EnergyChartConfig {
  timeRange: '24h' | '7d' | '30d' | '1y';
  dataType: 'power' | 'energy' | 'cost';
  devices: string[];        // Device IDs to include
  groupBy?: 'hour' | 'day' | 'week' | 'month';
}

// Form Types
export interface LoginForm {
  username: string;
  password: string;
  countryCode: string;
}

export interface DeviceEditForm {
  name: string;
  location?: string;
  autoControl: boolean;
  energyOptimization?: boolean;
}

// Navigation Types
export interface NavigationItem {
  path: string;
  label: string;
  icon: string;
  children?: NavigationItem[];
  requiresAuth?: boolean;
}

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  action?: 'retry' | 'refresh' | 'contact_support';
}

// Notification Types
export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: () => void;
  type: 'primary' | 'secondary';
}

// Future Phase 2 Types (Solar/Battery Ready)
export interface EnergyFlow {
  timestamp: Date;
  solar: number;            // Solar production (W)
  battery: number;          // Battery charge/discharge (W, positive = charging)
  grid: number;             // Grid import/export (W, positive = import)
  consumption: number;      // Total consumption (W)
}

export interface EnergyOptimization {
  deviceId: string;
  recommendation: 'reduce' | 'increase' | 'schedule' | 'maintain';
  reason: string;
  estimatedSavings?: number; // kWh or cost
  priority: 'low' | 'medium' | 'high';
}

// Export utility types
export type DeviceId = string;
export type UserId = string;
export type Timestamp = Date;