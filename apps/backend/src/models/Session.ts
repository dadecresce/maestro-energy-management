import { Schema, model, Document, Types } from 'mongoose';
import { UserSession } from '@maestro/shared/types/user';

/**
 * MongoDB Document Interface for User Session
 * Extends the shared UserSession type with Mongoose Document methods
 */
export interface ISessionDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  sessionToken: string;
  refreshToken?: string;
  deviceInfo?: {
    userAgent?: string;
    ipAddress?: string;
    platform?: string;
    browser?: string;
    deviceType?: string;
    osVersion?: string;
    location?: {
      country?: string;
      city?: string;
      timezone?: string;
    };
  };
  expiresAt: Date;
  lastAccessedAt: Date;
  isActive: boolean;
  revokedAt?: Date;
  revokeReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  isExpired(): boolean;
  updateLastAccessed(): Promise<void>;
  revoke(reason?: string): Promise<void>;
  extend(additionalTime: number): Promise<void>;
  updateDeviceInfo(deviceInfo: Partial<ISessionDocument['deviceInfo']>): Promise<void>;
  toSafeObject(): Omit<UserSession, 'refreshToken'>;
}

/**
 * Device Information Schema
 */
const DeviceInfoSchema = new Schema({
  userAgent: String,
  ipAddress: {
    type: String,
    validate: {
      validator: function(ip: string) {
        if (!ip) return true;
        // Basic IP validation (IPv4 and IPv6)
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
      },
      message: 'Invalid IP address format'
    }
  },
  platform: {
    type: String,
    enum: ['web', 'mobile', 'desktop', 'tablet', 'api', 'unknown'],
    default: 'unknown'
  },
  browser: String,
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'smart_tv', 'wearable', 'unknown'],
    default: 'unknown'
  },
  osVersion: String,
  location: {
    country: String,
    city: String,
    timezone: {
      type: String,
      default: 'UTC'
    }
  }
}, { _id: false });

/**
 * Main Session Schema
 */
const SessionSchema = new Schema<ISessionDocument>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  sessionToken: {
    type: String,
    required: [true, 'Session token is required'],
    unique: true,
    index: true
  },
  refreshToken: {
    type: String,
    index: { sparse: true }
  },
  deviceInfo: {
    type: DeviceInfoSchema,
    default: () => ({})
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
    index: true
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  revokedAt: Date,
  revokeReason: {
    type: String,
    enum: [
      'user_logout',
      'admin_revoke',
      'security_breach',
      'password_change',
      'account_suspended',
      'inactive_timeout',
      'device_stolen',
      'suspicious_activity',
      'policy_violation'
    ]
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.refreshToken; // Never expose refresh token in JSON
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
SessionSchema.index({ userId: 1 });
SessionSchema.index({ sessionToken: 1 }, { unique: true });
SessionSchema.index({ refreshToken: 1 }, { sparse: true });
SessionSchema.index({ expiresAt: 1 });
SessionSchema.index({ lastAccessedAt: 1 });
SessionSchema.index({ isActive: 1 });
SessionSchema.index({ createdAt: 1 });
SessionSchema.index({ 'deviceInfo.ipAddress': 1 });
SessionSchema.index({ 'deviceInfo.platform': 1 });

// Compound indexes for complex queries
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ userId: 1, lastAccessedAt: 1 });
SessionSchema.index({ isActive: 1, expiresAt: 1 });

// TTL index for automatic cleanup of expired sessions
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Pre-save middleware
 */
SessionSchema.pre('save', function(next) {
  // Set isActive to false if session is revoked
  if (this.revokedAt && this.isActive) {
    this.isActive = false;
  }
  
  // Set isActive to false if session is expired
  if (this.expiresAt < new Date() && this.isActive) {
    this.isActive = false;
  }
  
  next();
});

/**
 * Instance Methods
 */

// Check if session is expired
SessionSchema.methods.isExpired = function(): boolean {
  return new Date() > this.expiresAt || !this.isActive || !!this.revokedAt;
};

// Update last accessed timestamp
SessionSchema.methods.updateLastAccessed = async function(): Promise<void> {
  this.lastAccessedAt = new Date();
  await this.save();
};

// Revoke session
SessionSchema.methods.revoke = async function(reason?: string): Promise<void> {
  this.isActive = false;
  this.revokedAt = new Date();
  if (reason) {
    this.revokeReason = reason;
  }
  await this.save();
};

// Extend session expiration
SessionSchema.methods.extend = async function(additionalTime: number): Promise<void> {
  this.expiresAt = new Date(this.expiresAt.getTime() + additionalTime);
  this.lastAccessedAt = new Date();
  await this.save();
};

// Update device information
SessionSchema.methods.updateDeviceInfo = async function(
  deviceInfo: Partial<ISessionDocument['deviceInfo']>
): Promise<void> {
  this.deviceInfo = { ...this.deviceInfo, ...deviceInfo };
  this.lastAccessedAt = new Date();
  await this.save();
};

// Convert to safe object (without sensitive data)
SessionSchema.methods.toSafeObject = function(): Omit<UserSession, 'refreshToken'> {
  const obj = this.toObject();
  delete obj.refreshToken;
  return obj as Omit<UserSession, 'refreshToken'>;
};

/**
 * Static Methods
 */

// Find sessions by user
SessionSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId }).sort({ lastAccessedAt: -1 });
};

// Find active sessions by user
SessionSchema.statics.findActiveByUser = function(userId: string) {
  return this.find({ 
    userId, 
    isActive: true, 
    expiresAt: { $gt: new Date() } 
  }).sort({ lastAccessedAt: -1 });
};

// Find session by token
SessionSchema.statics.findByToken = function(sessionToken: string) {
  return this.findOne({ sessionToken, isActive: true });
};

// Find session by refresh token
SessionSchema.statics.findByRefreshToken = function(refreshToken: string) {
  return this.findOne({ 
    refreshToken, 
    isActive: true, 
    expiresAt: { $gt: new Date() } 
  });
};

// Find expired sessions for cleanup
SessionSchema.statics.findExpired = function() {
  return this.find({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isActive: false }
    ]
  });
};

// Revoke all sessions for a user
SessionSchema.statics.revokeAllByUser = function(userId: string, reason?: string) {
  return this.updateMany(
    { userId, isActive: true },
    { 
      $set: { 
        isActive: false, 
        revokedAt: new Date(),
        ...(reason && { revokeReason: reason })
      } 
    }
  );
};

// Revoke sessions by IP address (security feature)
SessionSchema.statics.revokeByIpAddress = function(ipAddress: string, reason?: string) {
  return this.updateMany(
    { 'deviceInfo.ipAddress': ipAddress, isActive: true },
    { 
      $set: { 
        isActive: false, 
        revokedAt: new Date(),
        ...(reason && { revokeReason: reason })
      } 
    }
  );
};

// Get session statistics
SessionSchema.statics.getStatistics = function(userId?: string) {
  const matchStage = userId ? { $match: { userId } } : { $match: {} };
  
  return this.aggregate([
    matchStage,
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        activeSessions: {
          $sum: {
            $cond: [
              { 
                $and: [
                  '$isActive', 
                  { $gt: ['$expiresAt', new Date()] }
                ] 
              }, 
              1, 
              0
            ]
          }
        },
        expiredSessions: {
          $sum: {
            $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0]
          }
        },
        revokedSessions: {
          $sum: {
            $cond: ['$revokedAt', 1, 0]
          }
        },
        sessionsByPlatform: {
          $push: '$deviceInfo.platform'
        },
        sessionsByDevice: {
          $push: '$deviceInfo.deviceType'
        },
        averageSessionDuration: {
          $avg: {
            $subtract: ['$lastAccessedAt', '$createdAt']
          }
        }
      }
    },
    {
      $project: {
        totalSessions: 1,
        activeSessions: 1,
        expiredSessions: 1,
        revokedSessions: 1,
        sessionsByPlatform: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: ['$sessionsByPlatform'] },
              as: 'platform',
              in: {
                k: '$$platform',
                v: {
                  $size: {
                    $filter: {
                      input: '$sessionsByPlatform',
                      cond: { $eq: ['$$this', '$$platform'] }
                    }
                  }
                }
              }
            }
          }
        },
        sessionsByDevice: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: ['$sessionsByDevice'] },
              as: 'device',
              in: {
                k: '$$device',
                v: {
                  $size: {
                    $filter: {
                      input: '$sessionsByDevice',
                      cond: { $eq: ['$$this', '$$device'] }
                    }
                  }
                }
              }
            }
          }
        },
        averageSessionDuration: { $round: ['$averageSessionDuration', 0] }
      }
    }
  ]);
};

// Get session activity over time
SessionSchema.statics.getSessionActivity = function(
  userId?: string,
  days: number = 30
) {
  const matchStage: any = {
    createdAt: { $gte: new Date(Date.now() - (days * 24 * 60 * 60 * 1000)) }
  };
  
  if (userId) {
    matchStage.userId = userId;
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { 
          $dateToString: { 
            format: '%Y-%m-%d', 
            date: '$createdAt' 
          } 
        },
        newSessions: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        platforms: { $push: '$deviceInfo.platform' }
      }
    },
    {
      $project: {
        date: '$_id',
        newSessions: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        platforms: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: ['$platforms'] },
              as: 'platform',
              in: {
                k: '$$platform',
                v: {
                  $size: {
                    $filter: {
                      input: '$platforms',
                      cond: { $eq: ['$$this', '$$platform'] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    { $sort: { date: 1 } }
  ]);
};

// Clean up expired and revoked sessions
SessionSchema.statics.cleanup = function() {
  return this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isActive: false, revokedAt: { $lt: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)) } }
    ]
  });
};

/**
 * Session Model Export
 */
export const Session = model<ISessionDocument>('Session', SessionSchema);
export default Session;

/**
 * Type exports for external use
 */
export type { ISessionDocument };
export { SessionSchema };