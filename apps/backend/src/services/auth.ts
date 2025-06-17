import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { config } from '@/config/environment';
import { CacheManager } from './cache';
import { DatabaseManager } from './database';
import logger from '@/config/logger';
import { ApiError, AuthenticationError, ValidationError } from '@/utils/errors';
import { User, UserAuth, UserSession, createUserWithDefaults, sanitizeUserForResponse } from '@maestro/shared/types/user';

export interface JWTPayload {
  userId: string;
  sessionId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  user: Omit<User, 'auth'>;
  token: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTPayload;
  expired?: boolean;
  error?: string;
}

/**
 * Authentication Service
 * 
 * Handles JWT token generation, validation, session management,
 * password hashing, and user authentication workflows
 */
export class AuthService {
  private db: DatabaseManager;
  private cache: CacheManager;

  constructor(db: DatabaseManager, cache: CacheManager) {
    this.db = db;
    this.cache = cache;
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: 'maestro-auth',
      audience: 'maestro-api'
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate session ID
   */
  generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate and decode JWT token
   */
  validateToken(token: string): TokenValidationResult {
    try {
      const payload = jwt.verify(token, config.jwt.secret, {
        issuer: 'maestro-auth',
        audience: 'maestro-api'
      }) as JWTPayload;

      return {
        valid: true,
        payload
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          expired: true,
          error: 'Token expired'
        };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return {
          valid: false,
          expired: false,
          error: 'Invalid token'
        };
      } else {
        return {
          valid: false,
          expired: false,
          error: 'Token validation failed'
        };
      }
    }
  }

  /**
   * Create user session
   */
  async createSession(
    userId: string, 
    deviceInfo?: {
      userAgent?: string;
      ipAddress?: string;
      platform?: string;
      browser?: string;
    }
  ): Promise<UserSession> {
    const sessionId = this.generateSessionId();
    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.parseTimeToMs(config.jwt.refreshExpiresIn));

    const session: UserSession = {
      _id: new ObjectId().toHexString(),
      userId,
      sessionToken: sessionId,
      refreshToken,
      deviceInfo,
      expiresAt,
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };

    // Store session in database
    const sessionsCollection = this.db.getSessionsCollection();
    await sessionsCollection.insertOne(session);

    // Cache session for quick access
    const sessionTTL = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    await this.cache.setSession(sessionId, session, sessionTTL);

    logger.info('User session created', { userId, sessionId });
    return session;
  }

  /**
   * Get session by session ID
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      // Try cache first
      let session = await this.cache.getSession(sessionId);
      
      if (!session) {
        // Fallback to database
        const sessionsCollection = this.db.getSessionsCollection();
        session = await sessionsCollection.findOne({ sessionToken: sessionId });
        
        if (session) {
          // Cache the session
          const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
          if (ttl > 0) {
            await this.cache.setSession(sessionId, session, ttl);
          }
        }
      }

      // Check if session is expired
      if (session && session.expiresAt < new Date()) {
        await this.invalidateSession(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Failed to get session', { sessionId, error });
      return null;
    }
  }

  /**
   * Update session last accessed time
   */
  async updateSessionAccess(sessionId: string): Promise<void> {
    try {
      const sessionsCollection = this.db.getSessionsCollection();
      await sessionsCollection.updateOne(
        { sessionToken: sessionId },
        { $set: { lastAccessedAt: new Date() } }
      );

      // Update cache
      const session = await this.cache.getSession(sessionId);
      if (session) {
        session.lastAccessedAt = new Date();
        const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
        if (ttl > 0) {
          await this.cache.setSession(sessionId, session, ttl);
        }
      }
    } catch (error) {
      logger.error('Failed to update session access', { sessionId, error });
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    try {
      // Remove from database
      const sessionsCollection = this.db.getSessionsCollection();
      await sessionsCollection.deleteOne({ sessionToken: sessionId });

      // Remove from cache
      await this.cache.deleteSession(sessionId);

      logger.info('Session invalidated', { sessionId });
    } catch (error) {
      logger.error('Failed to invalidate session', { sessionId, error });
      throw new ApiError('Failed to invalidate session', 500, 'SESSION_INVALIDATION_FAILED');
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    try {
      // Get all user sessions
      const sessionsCollection = this.db.getSessionsCollection();
      const sessions = await sessionsCollection.find({ userId }).toArray();

      // Remove from database
      await sessionsCollection.deleteMany({ userId });

      // Remove from cache
      for (const session of sessions) {
        await this.cache.deleteSession(session.sessionToken);
      }

      logger.info('All user sessions invalidated', { userId, count: sessions.length });
    } catch (error) {
      logger.error('Failed to invalidate all user sessions', { userId, error });
      throw new ApiError('Failed to invalidate user sessions', 500, 'SESSION_INVALIDATION_FAILED');
    }
  }

  /**
   * Create user account
   */
  async createUser(
    email: string,
    displayName: string,
    auth: UserAuth,
    profile?: any
  ): Promise<User> {
    try {
      const usersCollection = this.db.getUsersCollection();

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        throw new ValidationError('User with this email already exists');
      }

      // Create user with defaults
      const userData = createUserWithDefaults(email, displayName);
      
      const user: User = {
        ...userData,
        _id: new ObjectId().toHexString(),
        auth: [auth],
        profile: profile || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert user
      await usersCollection.insertOne(user);

      logger.info('User created', { userId: user._id, email, provider: auth.provider });
      return user;
    } catch (error) {
      logger.error('Failed to create user', { email, error });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      // Try cache first
      let user = await this.cache.getUserProfile(userId);
      
      if (!user) {
        // Fallback to database
        const usersCollection = this.db.getUsersCollection();
        user = await usersCollection.findOne({ _id: userId });
        
        if (user) {
          // Cache the user profile
          await this.cache.cacheUserProfile(userId, user);
        }
      }

      return user;
    } catch (error) {
      logger.error('Failed to get user by ID', { userId, error });
      return null;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const usersCollection = this.db.getUsersCollection();
      const user = await usersCollection.findOne({ email });
      
      if (user) {
        // Cache the user profile
        await this.cache.cacheUserProfile(user._id, user);
      }
      
      return user;
    } catch (error) {
      logger.error('Failed to get user by email', { email, error });
      return null;
    }
  }

  /**
   * Get user by auth provider
   */
  async getUserByAuth(provider: string, providerId: string): Promise<User | null> {
    try {
      const usersCollection = this.db.getUsersCollection();
      const user = await usersCollection.findOne({
        'auth.provider': provider,
        'auth.providerId': providerId
      });
      
      if (user) {
        // Cache the user profile
        await this.cache.cacheUserProfile(user._id, user);
      }
      
      return user;
    } catch (error) {
      logger.error('Failed to get user by auth', { provider, providerId, error });
      return null;
    }
  }

  /**
   * Update user auth information
   */
  async updateUserAuth(userId: string, authUpdate: Partial<UserAuth>, provider: string): Promise<void> {
    try {
      const usersCollection = this.db.getUsersCollection();
      
      await usersCollection.updateOne(
        { 
          _id: userId,
          'auth.provider': provider
        },
        {
          $set: {
            'auth.$.accessToken': authUpdate.accessToken,
            'auth.$.refreshToken': authUpdate.refreshToken,
            'auth.$.tokenExpiresAt': authUpdate.tokenExpiresAt,
            'auth.$.lastLoginAt': new Date(),
            updatedAt: new Date()
          }
        }
      );

      // Invalidate user cache
      await this.cache.invalidateUserCache(userId);

      logger.info('User auth updated', { userId, provider });
    } catch (error) {
      logger.error('Failed to update user auth', { userId, provider, error });
      throw new ApiError('Failed to update user auth', 500, 'USER_AUTH_UPDATE_FAILED');
    }
  }

  /**
   * Complete authentication process
   */
  async completeAuthentication(
    user: User,
    deviceInfo?: any
  ): Promise<AuthResult> {
    try {
      // Create session
      const session = await this.createSession(user._id, deviceInfo);

      // Generate JWT token
      const tokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
        userId: user._id,
        sessionId: session.sessionToken,
        email: user.email,
        role: user.role
      };

      const token = this.generateAccessToken(tokenPayload);

      // Update user stats
      await this.updateUserStats(user._id);

      const result: AuthResult = {
        user: sanitizeUserForResponse(user),
        token,
        refreshToken: session.refreshToken,
        sessionId: session.sessionToken,
        expiresIn: this.parseTimeToMs(config.jwt.expiresIn) / 1000
      };

      logger.info('Authentication completed', { userId: user._id, email: user.email });
      return result;
    } catch (error) {
      logger.error('Failed to complete authentication', { userId: user._id, error });
      throw new AuthenticationError('Authentication failed');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Find session with refresh token
      const sessionsCollection = this.db.getSessionsCollection();
      const session = await sessionsCollection.findOne({ refreshToken });

      if (!session) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.invalidateSession(session.sessionToken);
        throw new AuthenticationError('Refresh token expired');
      }

      // Get user
      const user = await this.getUserById(session.userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Generate new tokens
      const newRefreshToken = this.generateRefreshToken();
      const newExpiresAt = new Date(Date.now() + this.parseTimeToMs(config.jwt.refreshExpiresIn));

      // Update session
      await sessionsCollection.updateOne(
        { _id: session._id },
        {
          $set: {
            refreshToken: newRefreshToken,
            expiresAt: newExpiresAt,
            lastAccessedAt: new Date()
          }
        }
      );

      // Update cache
      session.refreshToken = newRefreshToken;
      session.expiresAt = newExpiresAt;
      session.lastAccessedAt = new Date();
      
      const sessionTTL = Math.floor((newExpiresAt.getTime() - Date.now()) / 1000);
      await this.cache.setSession(session.sessionToken, session, sessionTTL);

      // Generate new access token
      const tokenPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
        userId: user._id,
        sessionId: session.sessionToken,
        email: user.email,
        role: user.role
      };

      const token = this.generateAccessToken(tokenPayload);

      const result: AuthResult = {
        user: sanitizeUserForResponse(user),
        token,
        refreshToken: newRefreshToken,
        sessionId: session.sessionToken,
        expiresIn: this.parseTimeToMs(config.jwt.expiresIn) / 1000
      };

      logger.info('Access token refreshed', { userId: user._id, sessionId: session.sessionToken });
      return result;
    } catch (error) {
      logger.error('Failed to refresh access token', { error });
      throw error;
    }
  }

  /**
   * Update user statistics
   */
  private async updateUserStats(userId: string): Promise<void> {
    try {
      const usersCollection = this.db.getUsersCollection();
      await usersCollection.updateOne(
        { _id: userId },
        {
          $set: {
            lastLoginAt: new Date(),
            updatedAt: new Date()
          },
          $inc: {
            'stats.loginCount': 1
          }
        }
      );
    } catch (error) {
      logger.error('Failed to update user stats', { userId, error });
    }
  }

  /**
   * Parse time string to milliseconds
   */
  private parseTimeToMs(timeStr: string): number {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1));

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return parseInt(timeStr) * 1000;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const sessionsCollection = this.db.getSessionsCollection();
      const result = await sessionsCollection.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      if (result.deletedCount > 0) {
        logger.info('Expired sessions cleaned up', { count: result.deletedCount });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error });
    }
  }
}

export default AuthService;