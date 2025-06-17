import { FilterQuery, Types } from 'mongoose';
import { User, IUserDocument } from '@/models/User';
import { BaseService } from './BaseService';
import { 
  UserAuth, 
  AuthProvider, 
  UserRole,
  sanitizeUserForResponse 
} from '@maestro/shared/types/user';
import { QueryFilters } from '@maestro/shared/types';
import { ValidationError, NotFoundError } from '@/utils/errors';
import logger from '@/config/logger';

/**
 * User Service
 * 
 * Provides comprehensive user management operations including
 * authentication, profile management, and user statistics.
 */
export class UserService extends BaseService<IUserDocument> {
  constructor() {
    super(User);
  }

  /**
   * Create a new user with authentication
   */
  async createUser(
    email: string,
    displayName: string,
    auth: UserAuth,
    profileData?: any
  ): Promise<IUserDocument> {
    try {
      // Check if user already exists
      const existingUser = await this.findByEmail(email);
      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Check for existing auth provider
      const existingAuthUser = await this.findByAuth(auth.provider, auth.providerId);
      if (existingAuthUser) {
        throw new ValidationError(`User with this ${auth.provider} account already exists`);
      }

      const userData = {
        email: email.toLowerCase(),
        displayName,
        auth: [auth],
        profile: profileData || {},
        emailVerified: auth.provider !== 'local', // External providers are pre-verified
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const user = await this.create(userData);
      
      logger.info('User created successfully', { 
        userId: user._id, 
        email: user.email, 
        provider: auth.provider 
      });

      return user;
    } catch (error) {
      logger.error('Failed to create user', { email, provider: auth.provider, error });
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<IUserDocument | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  /**
   * Find user by authentication provider
   */
  async findByAuth(provider: AuthProvider, providerId: string): Promise<IUserDocument | null> {
    return this.findOne({
      'auth.provider': provider,
      'auth.providerId': providerId
    });
  }

  /**
   * Find active users
   */
  async findActiveUsers(): Promise<IUserDocument[]> {
    return this.find({
      isActive: true,
      isSuspended: false
    });
  }

  /**
   * Find users by role
   */
  async findByRole(role: UserRole): Promise<IUserDocument[]> {
    return this.find({ role });
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    profileData: Partial<IUserDocument['profile']>
  ): Promise<IUserDocument> {
    const user = await this.updateByIdOrThrow(userId, {
      $set: {
        'profile': profileData,
        updatedAt: new Date()
      }
    });

    logger.info('User profile updated', { userId });
    return user;
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: string,
    settingsData: Partial<IUserDocument['settings']>
  ): Promise<IUserDocument> {
    const user = await this.updateByIdOrThrow(userId, {
      $set: {
        'settings': settingsData,
        updatedAt: new Date()
      }
    });

    logger.info('User settings updated', { userId });
    return user;
  }

  /**
   * Add authentication provider to user
   */
  async addAuthProvider(userId: string, auth: UserAuth): Promise<IUserDocument> {
    const user = await this.findByIdOrThrow(userId);

    // Check if provider already exists
    const existingAuth = user.auth.find(a => a.provider === auth.provider);
    if (existingAuth) {
      throw new ValidationError(`User already has ${auth.provider} authentication`);
    }

    // Check if another user has this auth
    const existingUser = await this.findByAuth(auth.provider, auth.providerId);
    if (existingUser && existingUser._id.toString() !== userId) {
      throw new ValidationError(`Another user already has this ${auth.provider} account`);
    }

    await user.addAuthProvider(auth);
    logger.info('Auth provider added to user', { userId, provider: auth.provider });

    return user;
  }

  /**
   * Remove authentication provider from user
   */
  async removeAuthProvider(userId: string, provider: AuthProvider): Promise<IUserDocument> {
    const user = await this.findByIdOrThrow(userId);
    await user.removeAuthProvider(provider);
    
    logger.info('Auth provider removed from user', { userId, provider });
    return user;
  }

  /**
   * Update user authentication tokens
   */
  async updateAuthTokens(
    userId: string,
    provider: AuthProvider,
    tokens: {
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
    }
  ): Promise<IUserDocument> {
    const updateData: any = {
      updatedAt: new Date()
    };

    if (tokens.accessToken) {
      updateData['auth.$.accessToken'] = tokens.accessToken;
    }
    if (tokens.refreshToken) {
      updateData['auth.$.refreshToken'] = tokens.refreshToken;
    }
    if (tokens.tokenExpiresAt) {
      updateData['auth.$.tokenExpiresAt'] = tokens.tokenExpiresAt;
    }

    updateData['auth.$.lastLoginAt'] = new Date();

    const user = await this.updateOne(
      { 
        _id: userId,
        'auth.provider': provider
      },
      { $set: updateData }
    );

    if (!user) {
      throw new NotFoundError('User or auth provider not found');
    }

    logger.info('User auth tokens updated', { userId, provider });
    return user;
  }

  /**
   * Update user statistics
   */
  async updateStats(
    userId: string,
    updates: Partial<IUserDocument['stats']>
  ): Promise<IUserDocument> {
    const user = await this.findByIdOrThrow(userId);
    await user.updateStats(updates);
    
    return user;
  }

  /**
   * Increment user login count and update last login
   */
  async recordLogin(userId: string): Promise<IUserDocument> {
    const user = await this.findByIdOrThrow(userId);
    await user.updateLastLogin();
    await user.incrementLoginCount();
    
    return user;
  }

  /**
   * Suspend user account
   */
  async suspendUser(userId: string, reason: string): Promise<IUserDocument> {
    const user = await this.updateByIdOrThrow(userId, {
      $set: {
        isSuspended: true,
        suspensionReason: reason,
        updatedAt: new Date()
      }
    });

    logger.warn('User suspended', { userId, reason });
    return user;
  }

  /**
   * Unsuspend user account
   */
  async unsuspendUser(userId: string): Promise<IUserDocument> {
    const user = await this.updateByIdOrThrow(userId, {
      $set: {
        isSuspended: false,
        updatedAt: new Date()
      },
      $unset: {
        suspensionReason: 1
      }
    });

    logger.info('User unsuspended', { userId });
    return user;
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<IUserDocument> {
    const user = await this.updateByIdOrThrow(userId, {
      $set: {
        isActive: false,
        updatedAt: new Date()
      }
    });

    logger.info('User deactivated', { userId });
    return user;
  }

  /**
   * Verify user email
   */
  async verifyEmail(userId: string): Promise<IUserDocument> {
    const user = await this.updateByIdOrThrow(userId, {
      $set: {
        emailVerified: true,
        updatedAt: new Date()
      }
    });

    logger.info('User email verified', { userId });
    return user;
  }

  /**
   * Search users with filters
   */
  async searchUsers(
    queryFilters: QueryFilters,
    pagination: { page?: number; limit?: number } = {}
  ) {
    const filter = this.buildUserFilter(queryFilters);
    const sort = this.buildSort(queryFilters.sort);

    return this.findWithPagination(filter, {
      ...pagination,
      sort,
      projection: { auth: 0 } // Don't include sensitive auth data
    });
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(): Promise<any> {
    const stats = await this.aggregate([
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
          verifiedUsers: { $sum: { $cond: ['$emailVerified', 1, 0] } },
          usersByRole: {
            $push: '$role'
          },
          usersByProvider: {
            $push: '$auth.provider'
          },
          averageDevicesPerUser: { $avg: '$stats.totalDevices' },
          totalDevices: { $sum: '$stats.totalDevices' },
          totalCommands: { $sum: '$stats.totalCommands' },
          totalEnergyTracked: { $sum: '$stats.totalEnergyTracked' }
        }
      }
    ]);

    return stats[0] || {
      totalUsers: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      verifiedUsers: 0,
      usersByRole: {},
      usersByProvider: {},
      averageDevicesPerUser: 0,
      totalDevices: 0,
      totalCommands: 0,
      totalEnergyTracked: 0
    };
  }

  /**
   * Get user registration trends
   */
  async getRegistrationTrends(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          providers: { $push: '$auth.provider' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
  }

  /**
   * Get users with most devices
   */
  async getTopDeviceUsers(limit: number = 10): Promise<any[]> {
    return this.aggregate([
      {
        $match: {
          isActive: true,
          'stats.totalDevices': { $gt: 0 }
        }
      },
      {
        $project: {
          _id: 1,
          displayName: 1,
          email: 1,
          totalDevices: '$stats.totalDevices',
          totalCommands: '$stats.totalCommands',
          totalEnergyTracked: '$stats.totalEnergyTracked',
          lastActiveAt: '$stats.lastActiveAt'
        }
      },
      { $sort: { totalDevices: -1 } },
      { $limit: limit }
    ]);
  }

  /**
   * Get safe user object (without sensitive data)
   */
  async getSafeUser(userId: string): Promise<any> {
    const user = await this.findByIdOrThrow(userId);
    return sanitizeUserForResponse(user);
  }

  /**
   * Batch update user statistics
   */
  async batchUpdateStats(updates: Array<{ userId: string; stats: Partial<IUserDocument['stats']> }>): Promise<void> {
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.userId },
        update: { 
          $set: { 
            ...Object.keys(update.stats).reduce((acc, key) => {
              acc[`stats.${key}`] = update.stats[key];
              return acc;
            }, {} as any),
            'stats.lastActiveAt': new Date(),
            updatedAt: new Date()
          }
        }
      }
    }));

    await this.bulkWrite(bulkOps);
    logger.info('Batch user stats updated', { count: updates.length });
  }

  /**
   * Build user-specific filter
   */
  private buildUserFilter(queryFilters: QueryFilters): FilterQuery<IUserDocument> {
    const filter: FilterQuery<IUserDocument> = {};

    // Search in name and email
    if (queryFilters.search) {
      filter.$or = [
        { displayName: { $regex: queryFilters.search, $options: 'i' } },
        { email: { $regex: queryFilters.search, $options: 'i' } }
      ];
    }

    // Role filter
    if (queryFilters.role) {
      filter.role = queryFilters.role;
    }

    // Status filter
    if (queryFilters.status === 'active') {
      filter.isActive = true;
      filter.isSuspended = false;
    } else if (queryFilters.status === 'suspended') {
      filter.isSuspended = true;
    } else if (queryFilters.status === 'inactive') {
      filter.isActive = false;
    }

    // Email verification filter
    if (queryFilters.emailVerified !== undefined) {
      filter.emailVerified = queryFilters.emailVerified === 'true';
    }

    // Date range for registration
    if (queryFilters.dateFrom || queryFilters.dateTo) {
      filter.createdAt = {};
      if (queryFilters.dateFrom) {
        filter.createdAt.$gte = new Date(queryFilters.dateFrom);
      }
      if (queryFilters.dateTo) {
        filter.createdAt.$lte = new Date(queryFilters.dateTo);
      }
    }

    return filter;
  }
}

export default UserService;