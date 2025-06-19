import { Router, Request, Response } from 'express';
import { validateBody, validateParams, validatePagination } from '@/middleware/validation';
import { userSchemas, commonSchemas } from '@/middleware/validation';
import { AuthMiddleware } from '@/middleware/auth';
import { UserService } from '@/services/database/UserService';
import { DeviceService } from '@/services/database/DeviceService';
import { CacheManager } from '@/services/cache';
import { DatabaseManager } from '@/services/database';
import { ApiError, AuthenticationError, ValidationError } from '@/utils/errors';
import logger from '@/config/logger';

/**
 * User Management Routes
 * 
 * Handles user profile management, preferences, and account settings
 * All routes require authentication
 */
const router = Router();

// Services (would typically be injected via DI container)
let userService: UserService;
let deviceService: DeviceService;
let authMiddleware: AuthMiddleware;
let cache: CacheManager;

// Service initialization function (called from app startup)
export function initializeUserServices(
  db: DatabaseManager,
  cacheManager: CacheManager,
  authMw: AuthMiddleware
) {
  userService = new UserService(db.getUsersCollection());
  deviceService = new DeviceService(db.getDevicesCollection());
  authMiddleware = authMw;
  cache = cacheManager;
}

// Apply authentication middleware to all routes
router.use((req, res, next) => {
  if (authMiddleware) {
    return authMiddleware.requireAuth()(req, res, next);
  }
  next();
});

/**
 * GET /api/v1/users
 * Get list of users (admin only)
 */
router.get('/', validatePagination, async (req: Request, res: Response) => {
  try {
    const { page, limit, sort, order, search } = req.query;
    const currentUser = req.user;

    if (!userService) {
      throw new ApiError('User service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    // Check admin permissions
    if (!currentUser || currentUser.role !== 'admin') {
      throw new ApiError('Admin access required', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    logger.info('Admin user list request', { 
      adminId: currentUser._id,
      page, limit, sort, order, search,
      requestId: req.requestId 
    });

    // Build query filters
    const filters: any = {};
    if (search) {
      filters.$or = [
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ];
    }

    // Get users with pagination
    const result = await userService.findWithPagination(
      filters,
      {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        sort: sort as string || 'createdAt',
        order: order as 'asc' | 'desc' || 'desc'
      },
      {
        // Exclude sensitive fields
        auth: 0
      }
    );

    // Enhance user data with device counts
    const enhancedUsers = await Promise.all(
      result.data.map(async (user) => {
        const deviceCount = deviceService ? 
          await deviceService.countByUserId(user._id) : 0;
        
        return {
          ...user,
          deviceCount,
          // Remove auth field completely
          auth: undefined
        };
      })
    );

    res.json({
      success: true,
      data: enhancedUsers,
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('User list failed', { 
      adminId: req.user?._id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve users',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * GET /api/v1/users/:id
 * Get user by ID
 */
router.get('/:id', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    if (!userService) {
      throw new ApiError('User service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    // Check permissions (user can access own profile or admin can access any)
    if (!currentUser || (currentUser._id !== id && currentUser.role !== 'admin')) {
      throw new ApiError('Access denied', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    logger.info('User profile request', { 
      requesterId: currentUser._id,
      targetUserId: id, 
      requestId: req.requestId 
    });

    // Try cache first
    let user = await cache?.get(`user:profile:${id}`);
    
    if (!user) {
      // Fetch user from database
      user = await userService.findById(id, {
        // Exclude sensitive auth details unless admin
        ...(currentUser.role !== 'admin' && { auth: 0 })
      });
      
      if (!user) {
        throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
      }
      
      // Cache user profile for 5 minutes
      await cache?.set(`user:profile:${id}`, user, 300);
    }

    // Get additional user statistics
    const [deviceCount, preferences] = await Promise.all([
      deviceService ? deviceService.countByUserId(id) : 0,
      userService.getPreferences(id)
    ]);

    // Check Tuya connection status
    const tuyaAuth = user.auth?.find((auth: any) => auth.provider === 'tuya');
    const tuyaConnected = !!(tuyaAuth && tuyaAuth.accessToken && 
      (!tuyaAuth.tokenExpiresAt || tuyaAuth.tokenExpiresAt > new Date()));

    // Prepare response data
    const responseData = {
      ...user,
      preferences,
      tuyaConnected,
      deviceCount,
      // Transform auth providers info for security
      authProviders: user.auth?.map((auth: any) => ({
        provider: auth.provider,
        connected: !!(auth.accessToken && (!auth.tokenExpiresAt || auth.tokenExpiresAt > new Date())),
        lastLoginAt: auth.lastLoginAt
      })) || [],
      // Remove sensitive auth details from response
      auth: undefined
    };

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('User profile retrieval failed', { 
      requesterId: req.user?._id,
      targetUserId: req.params.id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user profile',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * PUT /api/v1/users/:id
 * Update user profile
 */
router.put('/:id', 
  validateParams({ id: commonSchemas.objectId }),
  validateBody(userSchemas.updateProfile),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const currentUser = req.user;

      if (!userService) {
        throw new ApiError('User service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
      }

      // Check permissions (user can update own profile or admin can update any)
      if (!currentUser || (currentUser._id !== id && currentUser.role !== 'admin')) {
        throw new ApiError('Access denied', 403, 'INSUFFICIENT_PERMISSIONS');
      }

      logger.info('User profile update', { 
        requesterId: currentUser._id,
        targetUserId: id, 
        updateFields: Object.keys(updateData),
        requestId: req.requestId 
      });

      // Verify user exists
      const existingUser = await userService.findById(id);
      if (!existingUser) {
        throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
      }

      // Prepare update data
      const updateFields: any = {
        updatedAt: new Date()
      };

      // Update basic profile fields
      if (updateData.firstName !== undefined) {
        updateFields['profile.firstName'] = updateData.firstName;
        // Update display name if both first and last name are being updated
        const lastName = updateData.lastName !== undefined ? updateData.lastName : existingUser.profile?.lastName;
        if (lastName) {
          updateFields.displayName = `${updateData.firstName} ${lastName}`.trim();
        }
      }
      
      if (updateData.lastName !== undefined) {
        updateFields['profile.lastName'] = updateData.lastName;
        // Update display name if both first and last name are being updated
        const firstName = updateData.firstName !== undefined ? updateData.firstName : existingUser.profile?.firstName;
        if (firstName) {
          updateFields.displayName = `${firstName} ${updateData.lastName}`.trim();
        }
      }

      if (updateData.timezone !== undefined) {
        updateFields['profile.timezone'] = updateData.timezone;
      }

      // Update preferences if provided
      if (updateData.preferences) {
        // Handle preferences separately to support partial updates
        await userService.updatePreferences(id, updateData.preferences);
      }

      // Update user in database
      const updateResult = await userService.updateById(id, { $set: updateFields });
      
      if (!updateResult) {
        throw new ApiError('Failed to update user profile', 500, 'UPDATE_FAILED');
      }

      // Invalidate cache
      await cache?.del(`user:profile:${id}`);

      // Get updated user data
      const updatedUser = await userService.findById(id, { auth: 0 });
      const preferences = await userService.getPreferences(id);

      const responseData = {
        ...updatedUser,
        preferences,
        // Remove sensitive fields
        auth: undefined
      };

      logger.info('User profile updated successfully', { 
        requesterId: currentUser._id,
        targetUserId: id,
        requestId: req.requestId 
      });

      res.json({
        success: true,
        data: responseData,
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });

    } catch (error) {
      logger.error('User profile update failed', { 
        requesterId: req.user?._id,
        targetUserId: req.params.id,
        error: error instanceof Error ? error.message : error, 
        requestId: req.requestId 
      });
      
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to update profile',
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }
  }
);

/**
 * DELETE /api/v1/users/:id
 * Delete user account (soft delete)
 */
router.delete('/:id', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    if (!userService) {
      throw new ApiError('User service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    // Check permissions (admin only or user deleting own account)
    if (!currentUser || (currentUser._id !== id && currentUser.role !== 'admin')) {
      throw new ApiError('Access denied', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    // Prevent admin from deleting themselves
    if (currentUser._id === id && currentUser.role === 'admin') {
      throw new ApiError('Administrators cannot delete their own account', 400, 'SELF_DELETION_FORBIDDEN');
    }

    logger.info('User deletion request', { 
      requesterId: currentUser._id,
      targetUserId: id, 
      requestId: req.requestId 
    });

    // Verify user exists
    const userToDelete = await userService.findById(id);
    if (!userToDelete) {
      throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Soft delete user (mark as inactive and suspended)
    const deleteResult = await userService.updateById(id, {
      $set: {
        isActive: false,
        isSuspended: true,
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    });

    if (!deleteResult) {
      throw new ApiError('Failed to delete user account', 500, 'DELETE_FAILED');
    }

    // Clean up related data asynchronously
    setImmediate(async () => {
      try {
        // Mark user devices as inactive
        if (deviceService) {
          await deviceService.updateMany(
            { userId: id },
            { $set: { isActive: false, updatedAt: new Date() } }
          );
        }

        // Invalidate all user sessions
        // Note: This would typically be done via AuthService
        // await authService.invalidateAllUserSessions(id);

        // TODO: Send account deletion confirmation email
        // await emailService.sendAccountDeletionConfirmation(userToDelete.email);

        // Clear user cache
        await cache?.del(`user:profile:${id}`);
        await cache?.del(`user:preferences:${id}`);

        logger.info('User account cleanup completed', { 
          deletedUserId: id,
          requesterId: currentUser._id
        });
      } catch (cleanupError) {
        logger.error('User account cleanup failed', { 
          deletedUserId: id,
          error: cleanupError 
        });
      }
    });

    logger.info('User account deleted successfully', { 
      requesterId: currentUser._id,
      deletedUserId: id,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      message: 'User account deleted successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('User deletion failed', { 
      requesterId: req.user?._id,
      targetUserId: req.params.id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete user account',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/users/:id/change-password
 * Change user password
 */
router.post('/:id/change-password',
  validateParams({ id: commonSchemas.objectId }),
  validateBody(userSchemas.changePassword),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;
      const currentUser = req.user;

      if (!userService) {
        throw new ApiError('User service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
      }

      // Check permissions (only user can change their own password)
      if (!currentUser || currentUser._id !== id) {
        throw new ApiError('You can only change your own password', 403, 'INSUFFICIENT_PERMISSIONS');
      }

      logger.info('Password change request', { 
        userId: id, 
        requestId: req.requestId 
      });

      // Get full user data including auth
      const user = await userService.findById(id);
      if (!user) {
        throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
      }

      // Find local auth provider
      const localAuth = user.auth?.find((auth: any) => auth.provider === 'local');
      if (!localAuth) {
        throw new ApiError('Local authentication not available for this account', 400, 'LOCAL_AUTH_NOT_AVAILABLE');
      }

      // Verify current password
      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(currentPassword, localAuth.accessToken);
      if (!isValidPassword) {
        throw new ApiError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update user password
      const updateResult = await userService.updateById(id, {
        $set: {
          'auth.$.accessToken': hashedNewPassword,
          'auth.$.lastLoginAt': new Date(),
          updatedAt: new Date()
        }
      }, {
        arrayFilters: [{ 'authElement.provider': 'local' }]
      });

      if (!updateResult) {
        throw new ApiError('Failed to update password', 500, 'PASSWORD_UPDATE_FAILED');
      }

      // TODO: Invalidate all user sessions except current one
      // await authService.invalidateAllUserSessions(id, currentSessionId);

      // TODO: Send password change confirmation email
      // await emailService.sendPasswordChangeConfirmation(user.email);

      // Clear user cache
      await cache?.del(`user:profile:${id}`);

      logger.info('Password changed successfully', { 
        userId: id,
        requestId: req.requestId 
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });

    } catch (error) {
      logger.error('Password change failed', { 
        userId: req.params.id,
        error: error instanceof Error ? error.message : error, 
        requestId: req.requestId 
      });
      
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Password change failed',
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }
  }
);

/**
 * GET /api/v1/users/:id/devices
 * Get user's devices
 */
router.get('/:id/devices', 
  validateParams({ id: commonSchemas.objectId }),
  validatePagination,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { page, limit, search, status, type, location } = req.query;
      const currentUser = req.user;

      if (!deviceService) {
        throw new ApiError('Device service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
      }

      // Check permissions (user accessing own devices or admin)
      if (!currentUser || (currentUser._id !== id && currentUser.role !== 'admin')) {
        throw new ApiError('Access denied', 403, 'INSUFFICIENT_PERMISSIONS');
      }

      logger.info('User devices request', { 
        requesterId: currentUser._id,
        targetUserId: id, 
        page, limit, search, status, type, location,
        requestId: req.requestId 
      });

      // Build query filters
      const filters: any = { userId: id };
      
      if (search) {
        filters.$or = [
          { name: { $regex: search, $options: 'i' } },
          { deviceId: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } },
          { room: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (status) {
        filters.status = status;
      }
      
      if (type) {
        filters.deviceType = type;
      }
      
      if (location) {
        filters.location = { $regex: location, $options: 'i' };
      }

      // Get devices with pagination
      const result = await deviceService.findWithPagination(
        filters,
        {
          page: Number(page) || 1,
          limit: Number(limit) || 20,
          sort: 'name',
          order: 'asc'
        }
      );

      // Enhance device data with real-time status
      const enhancedDevices = result.data.map(device => ({
        ...device,
        // Add computed fields
        connectionStatus: device.isOnline ? 'connected' : 'disconnected',
        lastActivity: device.lastSeenAt,
        // Remove sensitive fields if not admin
        ...(currentUser.role !== 'admin' && {
          internalId: undefined,
          credentials: undefined
        })
      }));

      res.json({
        success: true,
        data: enhancedDevices,
        pagination: result.pagination,
        summary: {
          total: result.pagination.total,
          online: enhancedDevices.filter(d => d.isOnline).length,
          offline: enhancedDevices.filter(d => !d.isOnline).length,
          byType: enhancedDevices.reduce((acc, device) => {
            acc[device.deviceType] = (acc[device.deviceType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        },
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });

    } catch (error) {
      logger.error('User devices retrieval failed', { 
        requesterId: req.user?._id,
        targetUserId: req.params.id,
        error: error instanceof Error ? error.message : error, 
        requestId: req.requestId 
      });
      
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve user devices',
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }
  }
);

/**
 * GET /api/v1/users/:id/stats
 * Get user statistics and analytics
 */
router.get('/:id/stats', validateParams({ id: commonSchemas.objectId }), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { period = '30d', timezone } = req.query;
    const currentUser = req.user;

    if (!userService || !deviceService) {
      throw new ApiError('Services not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    // Check permissions (user accessing own stats or admin)
    if (!currentUser || (currentUser._id !== id && currentUser.role !== 'admin')) {
      throw new ApiError('Access denied', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    logger.info('User stats request', { 
      requesterId: currentUser._id,
      targetUserId: id, 
      period,
      requestId: req.requestId 
    });

    // Calculate period dates
    const periodDays = parseInt(period?.toString().replace('d', '') || '30');
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    // Try to get cached stats first
    const cacheKey = `user:stats:${id}:${period}`;
    let stats = await cache?.get(cacheKey);

    if (!stats) {
      // Calculate device statistics
      const devices = await deviceService.findMany({ userId: id });
      const deviceStats = {
        total: devices.length,
        online: devices.filter(d => d.isOnline).length,
        offline: devices.filter(d => !d.isOnline).length,
        byType: devices.reduce((acc, device) => {
          acc[device.deviceType] = (acc[device.deviceType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byProtocol: devices.reduce((acc, device) => {
          acc[device.protocol] = (acc[device.protocol] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        recentlyAdded: devices.filter(d => 
          new Date(d.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length
      };

      // Calculate energy statistics (placeholder - would integrate with EnergyMeasurement model)
      const energyStats = {
        totalConsumption: Math.round(Math.random() * 500 + 100), // kWh this period
        averageDaily: Math.round((Math.random() * 500 + 100) / periodDays * 10) / 10,
        peakPower: Math.round(Math.random() * 2000 + 500), // Watts
        carbonFootprint: Math.round((Math.random() * 500 + 100) * 0.4), // kg CO2
        costEstimate: Math.round((Math.random() * 500 + 100) * 0.15 * 100) / 100, // EUR
        trend: Math.random() > 0.5 ? 'increasing' : 'decreasing'
      };

      // Calculate activity statistics (would integrate with DeviceCommand model)
      const activityStats = {
        commandsToday: Math.round(Math.random() * 50),
        commandsThisWeek: Math.round(Math.random() * 200),
        commandsThisPeriod: Math.round(Math.random() * 300),
        lastActivity: devices.length > 0 ? 
          devices.reduce((latest, device) => 
            device.lastSeenAt && (!latest || device.lastSeenAt > latest) ? 
              device.lastSeenAt : latest, null as Date | null
          ) : null,
        mostUsedDevice: devices.length > 0 ? devices[0].name : null,
        automationRuns: Math.round(Math.random() * 20)
      };

      // System health for this user
      const systemHealth = {
        deviceReliability: Math.round((deviceStats.online / Math.max(deviceStats.total, 1)) * 100),
        networkQuality: Math.round(Math.random() * 20 + 80), // 80-100%
        batteryHealth: devices.filter(d => d.deviceType === 'battery_pack').length > 0 ? 
          Math.round(Math.random() * 20 + 80) : null,
        alertsCount: Math.round(Math.random() * 5),
        maintenanceNeeded: Math.random() > 0.8
      };

      stats = {
        devices: deviceStats,
        energy: energyStats,
        activity: activityStats,
        systemHealth,
        period: {
          from: periodStart.toISOString(),
          to: periodEnd.toISOString(),
          days: periodDays
        },
        generatedAt: new Date().toISOString()
      };

      // Cache stats for 10 minutes
      await cache?.set(cacheKey, stats, 600);
    }

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('User stats retrieval failed', { 
      requesterId: req.user?._id,
      targetUserId: req.params.id,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user statistics',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

export default router;