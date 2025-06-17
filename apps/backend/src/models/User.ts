import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { 
  User as UserType,
  UserAuth,
  UserProfile,
  UserSettings,
  EnergyPreferences,
  AuthProvider,
  UserRole
} from '@maestro/shared/types/user';
import { ObjectId } from '@maestro/shared/types/base';

/**
 * MongoDB Document Interface for User
 * Extends the shared User type with Mongoose Document methods
 */
export interface IUserDocument extends Document {
  _id: Types.ObjectId;
  email: string;
  emailVerified: boolean;
  displayName: string;
  role: UserRole;
  auth: UserAuth[];
  profile: UserProfile;
  settings: UserSettings;
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  subscription?: {
    plan: 'free' | 'premium' | 'enterprise';
    expiresAt?: Date;
    features: string[];
    deviceLimit: number;
    apiCallLimit: number;
  };
  stats: {
    totalDevices: number;
    totalCommands: number;
    totalEnergyTracked: number;
    lastActiveAt?: Date;
    loginCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  
  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  updateLastLogin(): Promise<void>;
  incrementLoginCount(): Promise<void>;
  addAuthProvider(auth: UserAuth): Promise<void>;
  removeAuthProvider(provider: AuthProvider): Promise<void>;
  updateStats(updates: Partial<IUserDocument['stats']>): Promise<void>;
  toSafeObject(): Omit<UserType, 'auth'>;
}

/**
 * User Authentication Schema
 */
const UserAuthSchema = new Schema<UserAuth>({
  provider: {
    type: String,
    enum: ['tuya', 'google', 'apple', 'local'],
    required: true
  },
  providerId: {
    type: String,
    required: true
  },
  accessToken: String,
  refreshToken: String,
  tokenExpiresAt: Date,
  lastLoginAt: Date
}, { _id: false });

/**
 * User Profile Schema
 */
const UserProfileSchema = new Schema<UserProfile>({
  firstName: String,
  lastName: String,
  avatar: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar must be a valid URL'
    }
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  language: {
    type: String,
    default: 'en'
  },
  country: String,
  phoneNumber: String
}, { _id: false });

/**
 * Energy Preferences Schema (Phase 2)
 */
const EnergyPreferencesSchema = new Schema<EnergyPreferences>({
  energyTariff: {
    type: String,
    enum: ['fixed', 'time_of_use', 'real_time'],
    default: 'fixed'
  },
  currencyCode: {
    type: String,
    default: 'EUR'
  },
  energyPrice: {
    type: Number,
    default: 0.25,
    min: 0
  },
  optimizationMode: {
    type: String,
    enum: ['cost', 'carbon', 'performance', 'manual'],
    default: 'cost'
  },
  allowAutoControl: {
    type: Boolean,
    default: false
  },
  maxAutoPower: {
    type: Number,
    min: 0
  },
  solarOptimization: {
    type: Boolean,
    default: false
  },
  batteryChargeFromGrid: {
    type: Boolean,
    default: true
  },
  sellExcessToGrid: {
    type: Boolean,
    default: true
  },
  lowBatteryThreshold: {
    type: Number,
    default: 20,
    min: 0,
    max: 100
  },
  highConsumptionThreshold: {
    type: Number,
    default: 5000,
    min: 0
  },
  offlineDeviceAlert: {
    type: Boolean,
    default: true
  },
  energyReportFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'never'],
    default: 'weekly'
  }
}, { _id: false });

/**
 * User Settings Schema
 */
const UserSettingsSchema = new Schema<UserSettings>({
  theme: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'auto'
  },
  dashboardLayout: {
    type: String,
    enum: ['grid', 'list', 'compact'],
    default: 'grid'
  },
  defaultView: {
    type: String,
    enum: ['dashboard', 'devices', 'energy', 'settings'],
    default: 'dashboard'
  },
  pushNotifications: {
    type: Boolean,
    default: true
  },
  emailNotifications: {
    type: Boolean,
    default: true
  },
  smsNotifications: {
    type: Boolean,
    default: false
  },
  quietHours: {
    enabled: {
      type: Boolean,
      default: false
    },
    startTime: {
      type: String,
      default: '22:00'
    },
    endTime: {
      type: String,
      default: '07:00'
    }
  },
  dataSharing: {
    type: Boolean,
    default: false
  },
  analytics: {
    type: Boolean,
    default: true
  },
  crashReporting: {
    type: Boolean,
    default: true
  },
  energy: {
    type: EnergyPreferencesSchema,
    default: () => ({})
  }
}, { _id: false });

/**
 * User Stats Schema
 */
const UserStatsSchema = new Schema({
  totalDevices: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCommands: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEnergyTracked: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActiveAt: Date,
  loginCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

/**
 * User Subscription Schema (Future)
 */
const UserSubscriptionSchema = new Schema({
  plan: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free'
  },
  expiresAt: Date,
  features: {
    type: [String],
    default: []
  },
  deviceLimit: {
    type: Number,
    default: 10,
    min: 1
  },
  apiCallLimit: {
    type: Number,
    default: 1000,
    min: 100
  }
}, { _id: false });

/**
 * Main User Schema
 */
const UserSchema = new Schema<IUserDocument>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    minlength: [2, 'Display name must be at least 2 characters'],
    maxlength: [50, 'Display name cannot exceed 50 characters']
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'installer', 'energy_manager'],
    default: 'user'
  },
  auth: {
    type: [UserAuthSchema],
    required: true,
    validate: {
      validator: function(auth: UserAuth[]) {
        return auth.length > 0;
      },
      message: 'At least one authentication method is required'
    }
  },
  profile: {
    type: UserProfileSchema,
    default: () => ({})
  },
  settings: {
    type: UserSettingsSchema,
    default: () => ({})
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspensionReason: String,
  subscription: UserSubscriptionSchema,
  stats: {
    type: UserStatsSchema,
    default: () => ({})
  },
  lastLoginAt: Date
}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.auth; // Never expose auth tokens
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
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ 'auth.provider': 1, 'auth.providerId': 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ lastLoginAt: 1 });
UserSchema.index({ 'stats.lastActiveAt': 1 });

/**
 * Pre-save middleware for password hashing (for local auth)
 */
UserSchema.pre('save', async function(next) {
  if (!this.isModified('auth')) return next();
  
  // Hash passwords for local auth providers
  for (const auth of this.auth) {
    if (auth.provider === 'local' && auth.accessToken && !auth.accessToken.startsWith('$2')) {
      const saltRounds = 12;
      auth.accessToken = await bcrypt.hash(auth.accessToken, saltRounds);
    }
  }
  
  next();
});

/**
 * Pre-save middleware for updating stats
 */
UserSchema.pre('save', function(next) {
  if (this.isNew) {
    this.stats = {
      totalDevices: 0,
      totalCommands: 0,
      totalEnergyTracked: 0,
      loginCount: 0
    };
  }
  next();
});

/**
 * Instance Methods
 */

// Compare password for local authentication
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  const localAuth = this.auth.find((auth: UserAuth) => auth.provider === 'local');
  if (!localAuth || !localAuth.accessToken) {
    return false;
  }
  
  return await bcrypt.compare(candidatePassword, localAuth.accessToken);
};

// Update last login timestamp
UserSchema.methods.updateLastLogin = async function(): Promise<void> {
  this.lastLoginAt = new Date();
  this.stats.lastActiveAt = new Date();
  await this.save();
};

// Increment login count
UserSchema.methods.incrementLoginCount = async function(): Promise<void> {
  this.stats.loginCount += 1;
  await this.save();
};

// Add authentication provider
UserSchema.methods.addAuthProvider = async function(auth: UserAuth): Promise<void> {
  const existingIndex = this.auth.findIndex((a: UserAuth) => a.provider === auth.provider);
  if (existingIndex >= 0) {
    this.auth[existingIndex] = auth;
  } else {
    this.auth.push(auth);
  }
  await this.save();
};

// Remove authentication provider
UserSchema.methods.removeAuthProvider = async function(provider: AuthProvider): Promise<void> {
  if (this.auth.length <= 1) {
    throw new Error('Cannot remove the last authentication provider');
  }
  
  this.auth = this.auth.filter((auth: UserAuth) => auth.provider !== provider);
  await this.save();
};

// Update user statistics
UserSchema.methods.updateStats = async function(updates: Partial<IUserDocument['stats']>): Promise<void> {
  Object.assign(this.stats, updates);
  this.stats.lastActiveAt = new Date();
  await this.save();
};

// Convert to safe object (without sensitive data)
UserSchema.methods.toSafeObject = function(): Omit<UserType, 'auth'> {
  const obj = this.toObject();
  delete obj.auth;
  return obj;
};

/**
 * Static Methods
 */

// Find user by email
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// Find user by auth provider
UserSchema.statics.findByAuth = function(provider: AuthProvider, providerId: string) {
  return this.findOne({
    'auth.provider': provider,
    'auth.providerId': providerId
  });
};

// Find active users
UserSchema.statics.findActive = function() {
  return this.find({ isActive: true, isSuspended: false });
};

// Get user statistics
UserSchema.statics.getStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: {
            $cond: [{ $and: ['$isActive', { $not: '$isSuspended' }] }, 1, 0]
          }
        },
        suspendedUsers: { $sum: { $cond: ['$isSuspended', 1, 0] } },
        averageDevicesPerUser: { $avg: '$stats.totalDevices' },
        totalDevices: { $sum: '$stats.totalDevices' },
        totalCommands: { $sum: '$stats.totalCommands' },
        totalEnergyTracked: { $sum: '$stats.totalEnergyTracked' }
      }
    }
  ]);
};

/**
 * User Model Export
 */
export const User = model<IUserDocument>('User', UserSchema);
export default User;

/**
 * Type exports for external use
 */
export type { IUserDocument };
export { UserSchema };