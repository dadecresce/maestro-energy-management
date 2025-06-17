import { Collection, Filter, Sort } from 'mongodb';
import { 
  DeviceCommand, 
  CommandResult, 
  DeviceStatusUpdate 
} from '@maestro/shared/types';

import { BaseService } from '@/services/database/BaseService';
import { createError } from '@/utils/errors';
import logger, { createModuleLogger } from '@/config/logger';

/**
 * Device History Service
 * 
 * Manages device command history, status updates, and logging
 * for audit trails, analytics, and troubleshooting.
 * 
 * Features:
 * - Command execution logging
 * - Status change history
 * - Performance metrics
 * - Data retention policies
 * - Aggregated analytics
 */

export interface DeviceCommandLog {
  _id?: string;
  deviceId: string;
  userId: string;
  command: string;
  parameters: Record<string, any>;
  result?: Record<string, any>;
  success: boolean;
  duration: number; // milliseconds
  timestamp: Date;
  source: 'api' | 'websocket' | 'schedule' | 'automation' | 'manual';
  retryCount?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface DeviceStatusLog {
  _id?: string;
  deviceId: string;
  userId: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  previousStatus?: string;
  state: Record<string, any>;
  previousState?: Record<string, any>;
  timestamp: Date;
  source: 'polling' | 'webhook' | 'manual' | 'command_response' | 'adapter_event';
  changeType: 'status' | 'state' | 'both';
  metadata?: Record<string, any>;
}

export interface DevicePerformanceMetrics {
  deviceId: string;
  userId: string;
  period: 'hour' | 'day' | 'week' | 'month';
  periodStart: Date;
  periodEnd: Date;
  metrics: {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    averageResponseTime: number;
    uptimePercentage: number;
    statusChanges: number;
    energyConsumption?: number;
    powerPeaks?: number[];
  };
  createdAt: Date;
}

export interface DeviceHistoryQuery {
  deviceId?: string;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
  command?: string;
  success?: boolean;
  source?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'duration' | 'command';
  sortOrder?: 'asc' | 'desc';
}

export class DeviceHistoryService extends BaseService {
  private moduleLogger = createModuleLogger('DeviceHistoryService');
  private commandLogsCollection: Collection<DeviceCommandLog>;
  private statusLogsCollection: Collection<DeviceStatusLog>;
  private metricsCollection: Collection<DevicePerformanceMetrics>;
  private cleanupInterval?: NodeJS.Timeout;

  // Data retention settings (in days)
  private readonly RETENTION_PERIODS = {
    commandLogs: 90,      // 3 months
    statusLogs: 365,      // 1 year
    metrics: 730          // 2 years
  };

  constructor(
    commandLogsCollection: Collection<DeviceCommandLog>,
    statusLogsCollection: Collection<DeviceStatusLog>,
    metricsCollection: Collection<DevicePerformanceMetrics>
  ) {
    super();
    this.commandLogsCollection = commandLogsCollection;
    this.statusLogsCollection = statusLogsCollection;
    this.metricsCollection = metricsCollection;
    
    this.moduleLogger.info('Device history service initialized');
    this.startCleanupScheduler();
  }

  /**
   * Log device command execution
   */
  async logCommand(
    deviceId: string,
    userId: string,
    command: DeviceCommand,
    result: CommandResult,
    source: DeviceCommandLog['source'] = 'api',
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const logEntry: DeviceCommandLog = {
        deviceId,
        userId,
        command: command.command,
        parameters: command.parameters || {},
        result: result.result,
        success: result.success,
        duration: result.responseTime,
        timestamp: command.timestamp || new Date(),
        source,
        retryCount: result.retryCount || 0,
        errorMessage: result.error,
        metadata
      };

      const insertResult = await this.commandLogsCollection.insertOne(logEntry);
      
      this.moduleLogger.debug('Command logged', {
        deviceId,
        command: command.command,
        success: result.success,
        duration: result.responseTime,
        logId: insertResult.insertedId
      });

      return insertResult.insertedId.toString();

    } catch (error) {
      this.moduleLogger.error('Failed to log command', {
        deviceId,
        command: command.command,
        error
      });
      throw createError.internal('Failed to log device command', { originalError: error });
    }
  }

  /**
   * Log device status change
   */
  async logStatusChange(
    deviceId: string,
    userId: string,
    statusUpdate: DeviceStatusUpdate,
    previousStatus?: string,
    previousState?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      // Determine change type
      let changeType: DeviceStatusLog['changeType'] = 'state';
      if (previousStatus && previousStatus !== statusUpdate.status) {
        changeType = previousState ? 'both' : 'status';
      }

      const logEntry: DeviceStatusLog = {
        deviceId,
        userId,
        status: statusUpdate.status,
        previousStatus,
        state: statusUpdate.state,
        previousState,
        timestamp: statusUpdate.timestamp,
        source: statusUpdate.source as any,
        changeType,
        metadata
      };

      const insertResult = await this.statusLogsCollection.insertOne(logEntry);
      
      this.moduleLogger.debug('Status change logged', {
        deviceId,
        status: statusUpdate.status,
        changeType,
        logId: insertResult.insertedId
      });

      return insertResult.insertedId.toString();

    } catch (error) {
      this.moduleLogger.error('Failed to log status change', {
        deviceId,
        status: statusUpdate.status,
        error
      });
      throw createError.internal('Failed to log device status change', { originalError: error });
    }
  }

  /**
   * Get device command history
   */
  async getCommandHistory(query: DeviceHistoryQuery): Promise<{
    commands: DeviceCommandLog[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const filter = this.buildCommandFilter(query);
      const sort = this.buildSort(query.sortBy || 'timestamp', query.sortOrder || 'desc');
      const limit = Math.min(query.limit || 50, 1000); // Max 1000 records
      const offset = query.offset || 0;

      // Get total count
      const total = await this.commandLogsCollection.countDocuments(filter);

      // Get commands with pagination
      const commands = await this.commandLogsCollection
        .find(filter)
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .toArray();

      const hasMore = offset + commands.length < total;

      this.moduleLogger.debug('Command history retrieved', {
        filter,
        total,
        returned: commands.length,
        hasMore
      });

      return { commands, total, hasMore };

    } catch (error) {
      this.moduleLogger.error('Failed to get command history', { query, error });
      throw createError.internal('Failed to retrieve command history', { originalError: error });
    }
  }

  /**
   * Get device status history
   */
  async getStatusHistory(query: DeviceHistoryQuery): Promise<{
    statusLogs: DeviceStatusLog[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const filter = this.buildStatusFilter(query);
      const sort = this.buildSort(query.sortBy || 'timestamp', query.sortOrder || 'desc');
      const limit = Math.min(query.limit || 50, 1000);
      const offset = query.offset || 0;

      const total = await this.statusLogsCollection.countDocuments(filter);

      const statusLogs = await this.statusLogsCollection
        .find(filter)
        .sort(sort)
        .skip(offset)
        .limit(limit)
        .toArray();

      const hasMore = offset + statusLogs.length < total;

      return { statusLogs, total, hasMore };

    } catch (error) {
      this.moduleLogger.error('Failed to get status history', { query, error });
      throw createError.internal('Failed to retrieve status history', { originalError: error });
    }
  }

  /**
   * Get device performance analytics
   */
  async getDeviceAnalytics(
    deviceId: string,
    userId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{
    commandAnalytics: any;
    statusAnalytics: any;
    performanceMetrics: any;
  }> {
    try {
      const filter = {
        deviceId,
        userId,
        timestamp: { $gte: fromDate, $lte: toDate }
      };

      // Command analytics
      const commandAnalytics = await this.getCommandAnalytics(filter);
      
      // Status analytics
      const statusAnalytics = await this.getStatusAnalytics(filter);
      
      // Performance metrics
      const performanceMetrics = await this.getPerformanceMetrics(deviceId, userId, fromDate, toDate);

      return {
        commandAnalytics,
        statusAnalytics,
        performanceMetrics
      };

    } catch (error) {
      this.moduleLogger.error('Failed to get device analytics', {
        deviceId,
        userId,
        fromDate,
        toDate,
        error
      });
      throw createError.internal('Failed to retrieve device analytics', { originalError: error });
    }
  }

  /**
   * Generate performance metrics for a time period
   */
  async generatePerformanceMetrics(
    deviceId: string,
    userId: string,
    period: DevicePerformanceMetrics['period'],
    periodStart: Date,
    periodEnd: Date
  ): Promise<DevicePerformanceMetrics> {
    try {
      const commandFilter = {
        deviceId,
        userId,
        timestamp: { $gte: periodStart, $lte: periodEnd }
      };

      const statusFilter = {
        deviceId,
        userId,
        timestamp: { $gte: periodStart, $lte: periodEnd }
      };

      // Get command metrics
      const commandStats = await this.commandLogsCollection.aggregate([
        { $match: commandFilter },
        {
          $group: {
            _id: null,
            totalCommands: { $sum: 1 },
            successfulCommands: { $sum: { $cond: ['$success', 1, 0] } },
            failedCommands: { $sum: { $cond: ['$success', 0, 1] } },
            averageResponseTime: { $avg: '$duration' }
          }
        }
      ]).toArray();

      // Get status metrics
      const statusStats = await this.statusLogsCollection.aggregate([
        { $match: statusFilter },
        {
          $group: {
            _id: null,
            statusChanges: { $sum: 1 },
            onlineTime: {
              $sum: {
                $cond: [{ $eq: ['$status', 'online'] }, 1, 0]
              }
            },
            totalStatusLogs: { $sum: 1 }
          }
        }
      ]).toArray();

      const commandMetrics = commandStats[0] || {
        totalCommands: 0,
        successfulCommands: 0,
        failedCommands: 0,
        averageResponseTime: 0
      };

      const statusMetrics = statusStats[0] || {
        statusChanges: 0,
        onlineTime: 0,
        totalStatusLogs: 0
      };

      // Calculate uptime percentage
      const uptimePercentage = statusMetrics.totalStatusLogs > 0 
        ? (statusMetrics.onlineTime / statusMetrics.totalStatusLogs) * 100 
        : 0;

      const metrics: DevicePerformanceMetrics = {
        deviceId,
        userId,
        period,
        periodStart,
        periodEnd,
        metrics: {
          totalCommands: commandMetrics.totalCommands,
          successfulCommands: commandMetrics.successfulCommands,
          failedCommands: commandMetrics.failedCommands,
          averageResponseTime: Math.round(commandMetrics.averageResponseTime || 0),
          uptimePercentage: Math.round(uptimePercentage * 100) / 100,
          statusChanges: statusMetrics.statusChanges
        },
        createdAt: new Date()
      };

      // Store metrics
      await this.metricsCollection.insertOne(metrics);

      this.moduleLogger.debug('Performance metrics generated', {
        deviceId,
        period,
        metrics: metrics.metrics
      });

      return metrics;

    } catch (error) {
      this.moduleLogger.error('Failed to generate performance metrics', {
        deviceId,
        period,
        error
      });
      throw createError.internal('Failed to generate performance metrics', { originalError: error });
    }
  }

  /**
   * Clean up old history data based on retention policies
   */
  async cleanupOldData(): Promise<{
    commandLogsDeleted: number;
    statusLogsDeleted: number;
    metricsDeleted: number;
  }> {
    try {
      const now = new Date();
      
      // Calculate cutoff dates
      const commandLogsCutoff = new Date(now.getTime() - (this.RETENTION_PERIODS.commandLogs * 24 * 60 * 60 * 1000));
      const statusLogsCutoff = new Date(now.getTime() - (this.RETENTION_PERIODS.statusLogs * 24 * 60 * 60 * 1000));
      const metricsCutoff = new Date(now.getTime() - (this.RETENTION_PERIODS.metrics * 24 * 60 * 60 * 1000));

      // Delete old records
      const [commandLogsResult, statusLogsResult, metricsResult] = await Promise.all([
        this.commandLogsCollection.deleteMany({ timestamp: { $lt: commandLogsCutoff } }),
        this.statusLogsCollection.deleteMany({ timestamp: { $lt: statusLogsCutoff } }),
        this.metricsCollection.deleteMany({ createdAt: { $lt: metricsCutoff } })
      ]);

      const result = {
        commandLogsDeleted: commandLogsResult.deletedCount || 0,
        statusLogsDeleted: statusLogsResult.deletedCount || 0,
        metricsDeleted: metricsResult.deletedCount || 0
      };

      this.moduleLogger.info('Old data cleaned up', result);

      return result;

    } catch (error) {
      this.moduleLogger.error('Failed to cleanup old data', { error });
      throw createError.internal('Failed to cleanup old data', { originalError: error });
    }
  }

  /**
   * Get summary statistics for a device
   */
  async getDeviceSummary(deviceId: string, userId: string, days: number = 30): Promise<{
    totalCommands: number;
    successRate: number;
    averageResponseTime: number;
    uptimePercentage: number;
    lastCommand: Date | null;
    mostUsedCommand: string | null;
    recentErrors: string[];
  }> {
    try {
      const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      
      const commandFilter = {
        deviceId,
        userId,
        timestamp: { $gte: cutoffDate }
      };

      // Get command summary
      const commandSummary = await this.commandLogsCollection.aggregate([
        { $match: commandFilter },
        {
          $group: {
            _id: null,
            totalCommands: { $sum: 1 },
            successfulCommands: { $sum: { $cond: ['$success', 1, 0] } },
            averageResponseTime: { $avg: '$duration' },
            lastCommand: { $max: '$timestamp' }
          }
        }
      ]).toArray();

      // Get most used command
      const commandUsage = await this.commandLogsCollection.aggregate([
        { $match: commandFilter },
        {
          $group: {
            _id: '$command',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]).toArray();

      // Get recent errors
      const recentErrors = await this.commandLogsCollection
        .find({
          deviceId,
          userId,
          success: false,
          timestamp: { $gte: cutoffDate }
        })
        .sort({ timestamp: -1 })
        .limit(5)
        .toArray();

      // Get uptime from status logs
      const statusSummary = await this.statusLogsCollection.aggregate([
        {
          $match: {
            deviceId,
            userId,
            timestamp: { $gte: cutoffDate }
          }
        },
        {
          $group: {
            _id: null,
            onlineTime: {
              $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] }
            },
            totalLogs: { $sum: 1 }
          }
        }
      ]).toArray();

      const summary = commandSummary[0] || {
        totalCommands: 0,
        successfulCommands: 0,
        averageResponseTime: 0,
        lastCommand: null
      };

      const statusData = statusSummary[0] || { onlineTime: 0, totalLogs: 0 };
      const uptimePercentage = statusData.totalLogs > 0 
        ? (statusData.onlineTime / statusData.totalLogs) * 100 
        : 0;

      return {
        totalCommands: summary.totalCommands,
        successRate: summary.totalCommands > 0 
          ? (summary.successfulCommands / summary.totalCommands) * 100 
          : 0,
        averageResponseTime: Math.round(summary.averageResponseTime || 0),
        uptimePercentage: Math.round(uptimePercentage * 100) / 100,
        lastCommand: summary.lastCommand,
        mostUsedCommand: commandUsage[0]?._id || null,
        recentErrors: recentErrors.map(error => error.errorMessage).filter(Boolean)
      };

    } catch (error) {
      this.moduleLogger.error('Failed to get device summary', {
        deviceId,
        userId,
        days,
        error
      });
      throw createError.internal('Failed to get device summary', { originalError: error });
    }
  }

  // Private helper methods

  private buildCommandFilter(query: DeviceHistoryQuery): Filter<DeviceCommandLog> {
    const filter: Filter<DeviceCommandLog> = {};

    if (query.deviceId) filter.deviceId = query.deviceId;
    if (query.userId) filter.userId = query.userId;
    if (query.command) filter.command = query.command;
    if (query.success !== undefined) filter.success = query.success;
    if (query.source) filter.source = query.source as any;

    if (query.fromDate || query.toDate) {
      filter.timestamp = {};
      if (query.fromDate) filter.timestamp.$gte = query.fromDate;
      if (query.toDate) filter.timestamp.$lte = query.toDate;
    }

    return filter;
  }

  private buildStatusFilter(query: DeviceHistoryQuery): Filter<DeviceStatusLog> {
    const filter: Filter<DeviceStatusLog> = {};

    if (query.deviceId) filter.deviceId = query.deviceId;
    if (query.userId) filter.userId = query.userId;
    if (query.source) filter.source = query.source as any;

    if (query.fromDate || query.toDate) {
      filter.timestamp = {};
      if (query.fromDate) filter.timestamp.$gte = query.fromDate;
      if (query.toDate) filter.timestamp.$lte = query.toDate;
    }

    return filter;
  }

  private buildSort(sortBy: string, sortOrder: string): Sort {
    const order = sortOrder === 'asc' ? 1 : -1;
    return { [sortBy]: order };
  }

  private async getCommandAnalytics(filter: any): Promise<any> {
    return await this.commandLogsCollection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$command',
          count: { $sum: 1 },
          successCount: { $sum: { $cond: ['$success', 1, 0] } },
          averageResponseTime: { $avg: '$duration' },
          maxResponseTime: { $max: '$duration' },
          minResponseTime: { $min: '$duration' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
  }

  private async getStatusAnalytics(filter: any): Promise<any> {
    return await this.statusLogsCollection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
  }

  private async getPerformanceMetrics(
    deviceId: string,
    userId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<DevicePerformanceMetrics[]> {
    return await this.metricsCollection
      .find({
        deviceId,
        userId,
        periodStart: { $gte: fromDate },
        periodEnd: { $lte: toDate }
      })
      .sort({ periodStart: -1 })
      .toArray();
  }

  private startCleanupScheduler(): void {
    // Run cleanup every 24 hours
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOldData();
      } catch (error) {
        this.moduleLogger.error('Scheduled cleanup failed', { error });
      }
    }, 24 * 60 * 60 * 1000);

    this.moduleLogger.info('Cleanup scheduler started (24h interval)');
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    this.moduleLogger.info('Device history service shut down');
  }
}

export default DeviceHistoryService;