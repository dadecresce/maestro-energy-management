import { Schema, model, Document, Types } from 'mongoose';
import {
  DeviceCommand as DeviceCommandType,
  CommandResult
} from '@maestro/shared/types/device';
import { CommandStatus } from '@maestro/shared/types/base';

/**
 * MongoDB Document Interface for Device Command
 * Extends the shared DeviceCommand type with Mongoose Document methods and command execution tracking
 */
export interface IDeviceCommandDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  deviceId: string;
  deviceName?: string; // Cached device name for easier reporting
  command: string;
  parameters: Record<string, any>;
  status: CommandStatus;
  result?: CommandResult;
  scheduledAt?: Date;
  executedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  source: 'user' | 'automation' | 'schedule' | 'system' | 'api';
  sourceDetails?: Record<string, any>;
  duration?: number; // Command execution duration in milliseconds
  priority: 'low' | 'normal' | 'high' | 'critical';
  tags: string[]; // For categorization and analytics
  correlationId?: string; // For tracking related commands
  batchId?: string; // For grouping commands executed together
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  markAsExecuting(): Promise<void>;
  markAsCompleted(result: CommandResult): Promise<void>;
  markAsFailed(error: string, result?: Partial<CommandResult>): Promise<void>;
  markAsTimeout(): Promise<void>;
  markAsCancelled(): Promise<void>;
  incrementRetry(): Promise<void>;
  canRetry(): boolean;
  calculateDuration(): number;
  isExpired(): boolean;
  toAnalyticsObject(): any;
}

/**
 * Command Result Schema
 */
const CommandResultSchema = new Schema<CommandResult>({
  success: {
    type: Boolean,
    required: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  responseTime: {
    type: Number,
    required: true,
    min: 0
  },
  result: {
    type: Schema.Types.Mixed
  },
  error: String,
  retryCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: false });

/**
 * Main Device Command Schema
 */
const DeviceCommandSchema = new Schema<IDeviceCommandDocument>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    index: true
  },
  deviceName: {
    type: String,
    trim: true,
    index: true
  },
  command: {
    type: String,
    required: [true, 'Command is required'],
    trim: true,
    index: true
  },
  parameters: {
    type: Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'executing', 'completed', 'failed', 'timeout', 'cancelled'],
    default: 'pending',
    index: true
  },
  result: CommandResultSchema,
  scheduledAt: {
    type: Date,
    index: true
  },
  executedAt: Date,
  completedAt: Date,
  retryCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxRetries: {
    type: Number,
    default: 3,
    min: 0,
    max: 10
  },
  errorMessage: String,
  source: {
    type: String,
    enum: ['user', 'automation', 'schedule', 'system', 'api'],
    required: true,
    default: 'user',
    index: true
  },
  sourceDetails: {
    type: Schema.Types.Mixed,
    default: {}
  },
  duration: {
    type: Number,
    min: 0
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal',
    index: true
  },
  tags: {
    type: [String],
    default: [],
    index: true
  },
  correlationId: {
    type: String,
    index: true
  },
  batchId: {
    type: String,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
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
 * Indexes for optimal query performance and analytics
 */
DeviceCommandSchema.index({ userId: 1 });
DeviceCommandSchema.index({ deviceId: 1 });
DeviceCommandSchema.index({ command: 1 });
DeviceCommandSchema.index({ status: 1 });
DeviceCommandSchema.index({ source: 1 });
DeviceCommandSchema.index({ priority: 1 });
DeviceCommandSchema.index({ createdAt: 1 });
DeviceCommandSchema.index({ executedAt: 1 });
DeviceCommandSchema.index({ completedAt: 1 });
DeviceCommandSchema.index({ scheduledAt: 1 });
DeviceCommandSchema.index({ tags: 1 });
DeviceCommandSchema.index({ correlationId: 1 });
DeviceCommandSchema.index({ batchId: 1 });

// Compound indexes for complex queries and analytics
DeviceCommandSchema.index({ userId: 1, deviceId: 1 });
DeviceCommandSchema.index({ userId: 1, status: 1 });
DeviceCommandSchema.index({ userId: 1, createdAt: 1 });
DeviceCommandSchema.index({ deviceId: 1, status: 1 });
DeviceCommandSchema.index({ deviceId: 1, command: 1 });
DeviceCommandSchema.index({ status: 1, createdAt: 1 });
DeviceCommandSchema.index({ source: 1, status: 1 });
DeviceCommandSchema.index({ priority: 1, status: 1 });
DeviceCommandSchema.index({ createdAt: 1, status: 1 });

// TTL index for automatic cleanup of old commands (keep for 90 days)
DeviceCommandSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

/**
 * Pre-save middleware
 */
DeviceCommandSchema.pre('save', function(next) {
  // Set scheduled time if not provided
  if (!this.scheduledAt && this.status === 'pending') {
    this.scheduledAt = new Date();
  }
  
  // Calculate duration if command is completed
  if (this.status === 'completed' && this.executedAt && this.completedAt) {
    this.duration = this.completedAt.getTime() - this.executedAt.getTime();
  }
  
  next();
});

/**
 * Instance Methods
 */

// Mark command as executing
DeviceCommandSchema.methods.markAsExecuting = async function(): Promise<void> {
  this.status = 'executing';
  this.executedAt = new Date();
  await this.save();
};

// Mark command as completed with result
DeviceCommandSchema.methods.markAsCompleted = async function(result: CommandResult): Promise<void> {
  this.status = 'completed';
  this.completedAt = new Date();
  this.result = result;
  
  if (this.executedAt) {
    this.duration = this.completedAt.getTime() - this.executedAt.getTime();
  }
  
  await this.save();
};

// Mark command as failed
DeviceCommandSchema.methods.markAsFailed = async function(
  error: string, 
  result?: Partial<CommandResult>
): Promise<void> {
  this.status = 'failed';
  this.completedAt = new Date();
  this.errorMessage = error;
  
  if (result) {
    this.result = {
      success: false,
      timestamp: new Date(),
      responseTime: result.responseTime || 0,
      error,
      retryCount: this.retryCount,
      ...result
    };
  }
  
  if (this.executedAt) {
    this.duration = this.completedAt.getTime() - this.executedAt.getTime();
  }
  
  await this.save();
};

// Mark command as timeout
DeviceCommandSchema.methods.markAsTimeout = async function(): Promise<void> {
  this.status = 'timeout';
  this.completedAt = new Date();
  this.errorMessage = 'Command execution timeout';
  
  if (this.executedAt) {
    this.duration = this.completedAt.getTime() - this.executedAt.getTime();
  }
  
  await this.save();
};

// Mark command as cancelled
DeviceCommandSchema.methods.markAsCancelled = async function(): Promise<void> {
  this.status = 'cancelled';
  this.completedAt = new Date();
  
  if (this.executedAt) {
    this.duration = this.completedAt.getTime() - this.executedAt.getTime();
  }
  
  await this.save();
};

// Increment retry count
DeviceCommandSchema.methods.incrementRetry = async function(): Promise<void> {
  this.retryCount += 1;
  this.status = 'pending';
  this.executedAt = undefined;
  this.completedAt = undefined;
  this.errorMessage = undefined;
  await this.save();
};

// Check if command can be retried
DeviceCommandSchema.methods.canRetry = function(): boolean {
  return this.retryCount < this.maxRetries && 
         ['failed', 'timeout'].includes(this.status);
};

// Calculate current duration
DeviceCommandSchema.methods.calculateDuration = function(): number {
  if (!this.executedAt) return 0;
  
  const endTime = this.completedAt || new Date();
  return endTime.getTime() - this.executedAt.getTime();
};

// Check if command is expired (for scheduled commands)
DeviceCommandSchema.methods.isExpired = function(): boolean {
  if (!this.scheduledAt) return false;
  
  // Commands are considered expired if they haven't been executed within 1 hour of scheduled time
  const expirationTime = new Date(this.scheduledAt.getTime() + (60 * 60 * 1000));
  return new Date() > expirationTime && this.status === 'pending';
};

// Convert to analytics object
DeviceCommandSchema.methods.toAnalyticsObject = function(): any {
  return {
    id: this._id.toString(),
    userId: this.userId,
    deviceId: this.deviceId,
    deviceName: this.deviceName,
    command: this.command,
    status: this.status,
    source: this.source,
    priority: this.priority,
    duration: this.duration,
    retryCount: this.retryCount,
    success: this.result?.success,
    responseTime: this.result?.responseTime,
    tags: this.tags,
    createdAt: this.createdAt,
    executedAt: this.executedAt,
    completedAt: this.completedAt,
    scheduledAt: this.scheduledAt
  };
};

/**
 * Static Methods
 */

// Find commands by user
DeviceCommandSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

// Find commands by device
DeviceCommandSchema.statics.findByDevice = function(deviceId: string) {
  return this.find({ deviceId }).sort({ createdAt: -1 });
};

// Find pending commands
DeviceCommandSchema.statics.findPending = function() {
  return this.find({ 
    status: 'pending',
    $or: [
      { scheduledAt: { $lte: new Date() } },
      { scheduledAt: { $exists: false } }
    ]
  }).sort({ priority: 1, createdAt: 1 });
};

// Find expired commands
DeviceCommandSchema.statics.findExpired = function() {
  const expirationTime = new Date(Date.now() - (60 * 60 * 1000)); // 1 hour ago
  return this.find({
    status: 'pending',
    scheduledAt: { $lt: expirationTime }
  });
};

// Find commands for retry
DeviceCommandSchema.statics.findForRetry = function() {
  return this.find({
    status: { $in: ['failed', 'timeout'] },
    $expr: { $lt: ['$retryCount', '$maxRetries'] }
  }).sort({ priority: 1, createdAt: 1 });
};

// Get command statistics
DeviceCommandSchema.statics.getStatistics = function(userId?: string, timeRange?: { start: Date; end: Date }) {
  const matchStage: any = {};
  
  if (userId) {
    matchStage.userId = userId;
  }
  
  if (timeRange) {
    matchStage.createdAt = {
      $gte: timeRange.start,
      $lte: timeRange.end
    };
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCommands: { $sum: 1 },
        successfulCommands: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failedCommands: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        pendingCommands: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        timeoutCommands: {
          $sum: { $cond: [{ $eq: ['$status', 'timeout'] }, 1, 0] }
        },
        averageResponseTime: { $avg: '$result.responseTime' },
        averageDuration: { $avg: '$duration' },
        commandsBySource: {
          $push: '$source'
        },
        commandsByDevice: {
          $push: '$deviceId'
        },
        mostUsedCommands: {
          $push: '$command'
        }
      }
    },
    {
      $project: {
        totalCommands: 1,
        successfulCommands: 1,
        failedCommands: 1,
        pendingCommands: 1,
        timeoutCommands: 1,
        successRate: {
          $cond: [
            { $eq: ['$totalCommands', 0] },
            0,
            { $divide: ['$successfulCommands', '$totalCommands'] }
          ]
        },
        averageResponseTime: { $round: ['$averageResponseTime', 2] },
        averageDuration: { $round: ['$averageDuration', 2] },
        commandsBySource: {
          $arrayToObject: {
            $map: {
              input: { $setUnion: ['$commandsBySource'] },
              as: 'source',
              in: {
                k: '$$source',
                v: {
                  $size: {
                    $filter: {
                      input: '$commandsBySource',
                      cond: { $eq: ['$$this', '$$source'] }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]);
};

// Get command trends over time
DeviceCommandSchema.statics.getCommandTrends = function(
  userId?: string, 
  groupBy: 'hour' | 'day' | 'week' | 'month' = 'day',
  days: number = 30
) {
  const matchStage: any = {
    createdAt: { $gte: new Date(Date.now() - (days * 24 * 60 * 60 * 1000)) }
  };
  
  if (userId) {
    matchStage.userId = userId;
  }
  
  let dateFormat: string;
  switch (groupBy) {
    case 'hour':
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'day':
      dateFormat = '%Y-%m-%d';
      break;
    case 'week':
      dateFormat = '%Y-W%U';
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        totalCommands: { $sum: 1 },
        successfulCommands: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        failedCommands: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        averageResponseTime: { $avg: '$result.responseTime' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

/**
 * Device Command Model Export
 */
export const DeviceCommand = model<IDeviceCommandDocument>('DeviceCommand', DeviceCommandSchema);
export default DeviceCommand;

/**
 * Type exports for external use
 */
export type { IDeviceCommandDocument };
export { DeviceCommandSchema };