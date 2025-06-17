import { WebSocketManager } from './websocket';
import { CacheManager } from './cache';
import logger from '@/config/logger';
import { DeviceStatusUpdate } from '@maestro/shared/types';

/**
 * Notification Types
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  persistent?: boolean;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  action: string;
  url?: string;
  data?: any;
}

export type NotificationType = 
  | 'device_added'
  | 'device_removed'
  | 'device_online'
  | 'device_offline'
  | 'device_command_success'
  | 'device_command_failed'
  | 'energy_threshold_exceeded'
  | 'system_alert'
  | 'maintenance_required'
  | 'user_login'
  | 'security_alert'
  | 'system_update'
  | 'backup_completed'
  | 'error_occurred';

/**
 * Real-time Notification Service
 * 
 * Manages notifications, real-time updates, and user communication
 */
export class NotificationService {
  private wsManager: WebSocketManager;
  private cache: CacheManager;

  constructor(wsManager: WebSocketManager, cache: CacheManager) {
    this.wsManager = wsManager;
    this.cache = cache;
  }

  /**
   * Send notification to specific user
   */
  async sendToUser(userId: string, notification: Omit<Notification, 'id' | 'timestamp'>): Promise<void> {
    try {
      const fullNotification: Notification = {
        id: this.generateNotificationId(),
        timestamp: new Date(),
        ...notification
      };

      // Store persistent notifications
      if (notification.persistent) {
        await this.storeNotification(userId, fullNotification);
      }

      // Send real-time notification via WebSocket
      if (this.wsManager.isUserConnected(userId)) {
        this.wsManager.sendNotificationToUser(userId, {
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: {
            ...notification.data,
            id: fullNotification.id,
            priority: notification.priority,
            timestamp: fullNotification.timestamp,
            actions: notification.actions
          }
        });

        logger.debug('Real-time notification sent', {
          userId,
          notificationId: fullNotification.id,
          type: notification.type
        });
      } else {
        logger.debug('User not connected, notification stored for later', {
          userId,
          notificationId: fullNotification.id,
          type: notification.type
        });
      }

      // Log notification
      logger.info('Notification sent', {
        userId,
        notificationId: fullNotification.id,
        type: notification.type,
        priority: notification.priority
      });

    } catch (error) {
      logger.error('Failed to send notification', {
        userId,
        notification,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(userIds: string[], notification: Omit<Notification, 'id' | 'timestamp'>): Promise<void> {
    const promises = userIds.map(userId => this.sendToUser(userId, notification));
    await Promise.allSettled(promises);
  }

  /**
   * Broadcast system-wide announcement
   */
  async broadcastAnnouncement(announcement: {
    type: 'info' | 'warning' | 'error' | 'maintenance';
    title: string;
    message: string;
    data?: any;
  }): Promise<void> {
    try {
      this.wsManager.broadcastAnnouncement(announcement);
      
      logger.info('System announcement broadcasted', {
        type: announcement.type,
        title: announcement.title
      });
    } catch (error) {
      logger.error('Failed to broadcast announcement', {
        announcement,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Send device-related notifications
   */
  async sendDeviceNotification(
    userId: string,
    deviceId: string,
    deviceName: string,
    type: 'online' | 'offline' | 'command_success' | 'command_failed' | 'error',
    details?: any
  ): Promise<void> {
    const notificationMap = {
      online: {
        type: 'device_online' as NotificationType,
        title: 'Device Online',
        message: `${deviceName} is now online`,
        priority: 'low' as const
      },
      offline: {
        type: 'device_offline' as NotificationType,
        title: 'Device Offline',
        message: `${deviceName} has gone offline`,
        priority: 'medium' as const
      },
      command_success: {
        type: 'device_command_success' as NotificationType,
        title: 'Command Executed',
        message: `Command executed successfully on ${deviceName}`,
        priority: 'low' as const
      },
      command_failed: {
        type: 'device_command_failed' as NotificationType,
        title: 'Command Failed',
        message: `Failed to execute command on ${deviceName}`,
        priority: 'medium' as const
      },
      error: {
        type: 'device_offline' as NotificationType,
        title: 'Device Error',
        message: `${deviceName} reported an error`,
        priority: 'high' as const
      }
    };

    const notification = notificationMap[type];
    if (notification) {
      await this.sendToUser(userId, {
        ...notification,
        data: {
          deviceId,
          deviceName,
          details
        },
        actions: this.getDeviceActions(deviceId, type)
      });
    }
  }

  /**
   * Send energy-related notifications
   */
  async sendEnergyNotification(
    userId: string,
    type: 'threshold_exceeded' | 'optimization_available' | 'peak_usage',
    data: any
  ): Promise<void> {
    const notificationMap = {
      threshold_exceeded: {
        type: 'energy_threshold_exceeded' as NotificationType,
        title: 'Energy Threshold Exceeded',
        message: `Energy consumption has exceeded your set threshold`,
        priority: 'medium' as const
      },
      optimization_available: {
        type: 'system_alert' as NotificationType,
        title: 'Optimization Available',
        message: `Energy optimization opportunities detected`,
        priority: 'low' as const
      },
      peak_usage: {
        type: 'system_alert' as NotificationType,
        title: 'Peak Usage Alert',
        message: `Peak energy usage detected during expensive hours`,
        priority: 'medium' as const
      }
    };

    const notification = notificationMap[type];
    if (notification) {
      await this.sendToUser(userId, {
        ...notification,
        data,
        persistent: true
      });
    }
  }

  /**
   * Send security notifications
   */
  async sendSecurityNotification(
    userId: string,
    type: 'login_success' | 'login_failure' | 'password_changed' | 'suspicious_activity',
    details: any
  ): Promise<void> {
    const notificationMap = {
      login_success: {
        type: 'user_login' as NotificationType,
        title: 'New Login',
        message: `New login from ${details.location || 'unknown location'}`,
        priority: 'low' as const
      },
      login_failure: {
        type: 'security_alert' as NotificationType,
        title: 'Failed Login Attempt',
        message: `Failed login attempt detected`,
        priority: 'medium' as const
      },
      password_changed: {
        type: 'security_alert' as NotificationType,
        title: 'Password Changed',
        message: `Your password has been changed successfully`,
        priority: 'medium' as const
      },
      suspicious_activity: {
        type: 'security_alert' as NotificationType,
        title: 'Suspicious Activity',
        message: `Suspicious activity detected on your account`,
        priority: 'critical' as const
      }
    };

    const notification = notificationMap[type];
    if (notification) {
      await this.sendToUser(userId, {
        ...notification,
        data: details,
        persistent: true
      });
    }
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    try {
      const cacheKey = `notifications:${userId}`;
      const notifications = await this.cache.get(cacheKey) || '[]';
      const parsed = JSON.parse(notifications) as Notification[];
      
      return parsed
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get user notifications', { userId, error });
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    try {
      const cacheKey = `notifications:${userId}`;
      const notifications = await this.cache.get(cacheKey) || '[]';
      const parsed = JSON.parse(notifications) as Notification[];
      
      const updated = parsed.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: true }
          : notification
      );
      
      await this.cache.set(cacheKey, JSON.stringify(updated), 7 * 24 * 3600); // 7 days
    } catch (error) {
      logger.error('Failed to mark notification as read', { userId, notificationId, error });
    }
  }

  /**
   * Clear user notifications
   */
  async clearUserNotifications(userId: string): Promise<void> {
    try {
      const cacheKey = `notifications:${userId}`;
      await this.cache.del(cacheKey);
      
      logger.info('User notifications cleared', { userId });
    } catch (error) {
      logger.error('Failed to clear user notifications', { userId, error });
    }
  }

  /**
   * Handle device status updates with notifications
   */
  async handleDeviceStatusUpdate(update: DeviceStatusUpdate, userId?: string): Promise<void> {
    if (!userId) return;

    try {
      // Get device name from cache or database
      const deviceName = await this.getDeviceName(update.deviceId) || 'Unknown Device';
      
      // Determine notification type based on status change
      if (update.status === 'online' && update.source !== 'initial') {
        await this.sendDeviceNotification(userId, update.deviceId, deviceName, 'online');
      } else if (update.status === 'offline') {
        await this.sendDeviceNotification(userId, update.deviceId, deviceName, 'offline');
      }

      // Broadcast real-time update
      this.wsManager.broadcastDeviceUpdate(update);
      
    } catch (error) {
      logger.error('Failed to handle device status update notification', {
        update,
        userId,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  // Private helper methods
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storeNotification(userId: string, notification: Notification): Promise<void> {
    try {
      const cacheKey = `notifications:${userId}`;
      const existing = await this.cache.get(cacheKey) || '[]';
      const notifications = JSON.parse(existing) as Notification[];
      
      // Add new notification
      notifications.unshift(notification);
      
      // Keep only last 100 notifications
      const trimmed = notifications.slice(0, 100);
      
      // Store for 7 days
      await this.cache.set(cacheKey, JSON.stringify(trimmed), 7 * 24 * 3600);
    } catch (error) {
      logger.error('Failed to store notification', { userId, notification, error });
    }
  }

  private getDeviceActions(deviceId: string, type: string): NotificationAction[] {
    const actions: NotificationAction[] = [
      {
        id: 'view_device',
        label: 'View Device',
        action: 'navigate',
        url: `/devices/${deviceId}`
      }
    ];

    if (type === 'offline') {
      actions.push({
        id: 'retry_connection',
        label: 'Retry Connection',
        action: 'device_command',
        data: { deviceId, command: 'ping' }
      });
    }

    return actions;
  }

  private async getDeviceName(deviceId: string): Promise<string | null> {
    try {
      const cacheKey = `device:name:${deviceId}`;
      return await this.cache.get(cacheKey);
    } catch (error) {
      logger.error('Failed to get device name', { deviceId, error });
      return null;
    }
  }
}

export default NotificationService;