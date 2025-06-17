import { z } from 'zod';
import { ObjectId, AuthProvider, UserRole } from './base';

// User Authentication Schema
export const UserAuthSchema = z.object({
  provider: AuthProvider,
  providerId: z.string(), // External provider ID (Tuya user ID, Google ID, etc.)
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.date().optional(),
  lastLoginAt: z.date().optional()
});

export type UserAuth = z.infer<typeof UserAuthSchema>;

// User Profile Schema
export const UserProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  avatar: z.string().url().optional(),
  timezone: z.string().default('UTC'),
  language: z.string().default('en'),
  country: z.string().optional(),
  phoneNumber: z.string().optional()
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// Energy Preferences Schema (Phase 2)
export const EnergyPreferencesSchema = z.object({
  // Pricing preferences
  energyTariff: z.enum(['fixed', 'time_of_use', 'real_time']).default('fixed'),
  currencyCode: z.string().default('EUR'),
  energyPrice: z.number().positive().default(0.25), // EUR/kWh
  
  // Optimization preferences
  optimizationMode: z.enum(['cost', 'carbon', 'performance', 'manual']).default('cost'),
  allowAutoControl: z.boolean().default(false),
  maxAutoPower: z.number().positive().optional(), // Max power for auto control (W)
  
  // Solar preferences (Phase 2)
  solarOptimization: z.boolean().default(false),
  batteryChargeFromGrid: z.boolean().default(true),
  sellExcessToGrid: z.boolean().default(true),
  
  // Notification preferences
  lowBatteryThreshold: z.number().min(0).max(100).default(20), // %
  highConsumptionThreshold: z.number().positive().default(5000), // W
  offlineDeviceAlert: z.boolean().default(true),
  energyReportFrequency: z.enum(['daily', 'weekly', 'monthly', 'never']).default('weekly')
});

export type EnergyPreferences = z.infer<typeof EnergyPreferencesSchema>;

// User Settings Schema
export const UserSettingsSchema = z.object({
  // UI Preferences
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  dashboardLayout: z.enum(['grid', 'list', 'compact']).default('grid'),
  defaultView: z.enum(['dashboard', 'devices', 'energy', 'settings']).default('dashboard'),
  
  // Notification settings
  pushNotifications: z.boolean().default(true),
  emailNotifications: z.boolean().default(true),
  smsNotifications: z.boolean().default(false),
  quietHours: z.object({
    enabled: z.boolean().default(false),
    startTime: z.string().default('22:00'), // HH:MM
    endTime: z.string().default('07:00')
  }),
  
  // Privacy settings
  dataSharing: z.boolean().default(false),
  analytics: z.boolean().default(true),
  crashReporting: z.boolean().default(true),
  
  // Energy preferences
  energy: EnergyPreferencesSchema.default({})
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

// Main User Schema
export const UserSchema = z.object({
  _id: z.string(), // MongoDB ObjectId
  
  // Basic user information
  email: z.string().email(),
  emailVerified: z.boolean().default(false),
  displayName: z.string(),
  role: UserRole.default('user'),
  
  // Authentication
  auth: z.array(UserAuthSchema).min(1), // Support multiple auth providers
  
  // Profile information
  profile: UserProfileSchema.default({}),
  
  // User settings and preferences
  settings: UserSettingsSchema.default({}),
  
  // Account status
  isActive: z.boolean().default(true),
  isSuspended: z.boolean().default(false),
  suspensionReason: z.string().optional(),
  
  // Subscription info (Future)
  subscription: z.object({
    plan: z.enum(['free', 'premium', 'enterprise']).default('free'),
    expiresAt: z.date().optional(),
    features: z.array(z.string()).default([]),
    deviceLimit: z.number().default(10),
    apiCallLimit: z.number().default(1000) // per month
  }).optional(),
  
  // Usage statistics
  stats: z.object({
    totalDevices: z.number().default(0),
    totalCommands: z.number().default(0),
    totalEnergyTracked: z.number().default(0), // kWh
    lastActiveAt: z.date().optional(),
    loginCount: z.number().default(0)
  }).default({}),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date().optional()
});

export type User = z.infer<typeof UserSchema>;

// User Session Schema
export const UserSessionSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  sessionToken: z.string(),
  refreshToken: z.string().optional(),
  deviceInfo: z.object({
    userAgent: z.string().optional(),
    ipAddress: z.string().optional(),
    platform: z.string().optional(),
    browser: z.string().optional()
  }).optional(),
  expiresAt: z.date(),
  createdAt: z.date(),
  lastAccessedAt: z.date()
});

export type UserSession = z.infer<typeof UserSessionSchema>;

// User Activity Log Schema
export const UserActivitySchema = z.object({
  _id: z.string(),
  userId: z.string(),
  action: z.enum([
    'login',
    'logout',
    'device_added',
    'device_removed',
    'device_controlled',
    'settings_changed',
    'profile_updated',
    'password_changed',
    'account_deleted'
  ]),
  details: z.record(z.any()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.date()
});

export type UserActivity = z.infer<typeof UserActivitySchema>;

// Registration/Login request schemas
export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(50),
  password: z.string().min(8).optional(), // Optional for OAuth
  provider: AuthProvider,
  providerId: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional()
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  provider: AuthProvider,
  email: z.string().email().optional(),
  password: z.string().optional(),
  providerId: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional()
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Response schemas
export const AuthResponseSchema = z.object({
  user: UserSchema.omit({ auth: true }), // Don't expose auth tokens
  sessionToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds
  permissions: z.array(z.string()).default([])
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// Helper functions
export const createUserWithDefaults = (email: string, displayName: string): Partial<User> => ({
  email,
  displayName,
  emailVerified: false,
  role: 'user',
  auth: [],
  profile: {},
  settings: {},
  isActive: true,
  isSuspended: false,
  stats: {
    totalDevices: 0,
    totalCommands: 0,
    totalEnergyTracked: 0,
    loginCount: 0
  },
  createdAt: new Date(),
  updatedAt: new Date()
});

export const sanitizeUserForResponse = (user: User): Omit<User, 'auth'> => {
  const { auth, ...sanitizedUser } = user;
  return sanitizedUser;
};