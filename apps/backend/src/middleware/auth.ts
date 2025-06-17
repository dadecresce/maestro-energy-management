import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService, JWTPayload } from '@/services/auth';
import { CacheManager } from '@/services/cache';
import { config } from '@/config/environment';
import logger from '@/config/logger';
import { ApiError, AuthenticationError, ForbiddenError } from '@/utils/errors';
import { User } from '@maestro/shared/types/user';

// Extend Express Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'auth'>;
      session?: any;
      requestId?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: Omit<User, 'auth'>;
  tokenPayload: JWTPayload;
}

/**
 * Authentication Middleware Factory
 */
export class AuthMiddleware {
  private authService: AuthService;
  private cache: CacheManager;

  constructor(authService: AuthService, cache: CacheManager) {
    this.authService = authService;
    this.cache = cache;
  }

  /**
   * Require authentication - validates JWT token and attaches user to request
   */
  requireAuth = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          throw new AuthenticationError('Authentication token required');
        }

        // Validate token
        const validation = this.authService.validateToken(token);
        if (!validation.valid || !validation.payload) {
          if (validation.expired) {
            throw new AuthenticationError('Token expired', 'TOKEN_EXPIRED');
          }
          throw new AuthenticationError('Invalid authentication token', 'INVALID_TOKEN');
        }

        // Check if session is still valid
        const session = await this.authService.getSession(validation.payload.sessionId);
        if (!session) {
          throw new AuthenticationError('Session invalid or expired', 'SESSION_INVALID');
        }

        // Get user
        const user = await this.authService.getUserById(validation.payload.userId);
        if (!user) {
          throw new AuthenticationError('User not found', 'USER_NOT_FOUND');
        }

        // Check if user is active
        if (!user.isActive || user.isSuspended) {
          throw new ForbiddenError('Account is deactivated or suspended');
        }

        // Update session last access time (async, don't block request)
        this.authService.updateSessionAccess(validation.payload.sessionId).catch(error => {
          logger.error('Failed to update session access time', { 
            sessionId: validation.payload.sessionId, 
            error 
          });
        });

        // Attach user and token data to request
        req.user = {
          _id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          role: user.role,
          profile: user.profile,
          settings: user.settings,
          isActive: user.isActive,
          isSuspended: user.isSuspended,
          suspensionReason: user.suspensionReason,
          subscription: user.subscription,
          stats: user.stats,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt
        };
        
        (req as AuthenticatedRequest).tokenPayload = validation.payload;

        next();
      } catch (error) {
        logger.warn('Authentication failed', { 
          error: error instanceof Error ? error.message : error,
          url: req.url,
          method: req.method,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          requestId: req.requestId
        });

        if (error instanceof AuthenticationError || error instanceof ForbiddenError) {
          res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          });
        } else {
          res.status(401).json({
            success: false,
            error: 'Authentication failed',
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          });
        }
      }
    };
  };

  /**
   * Optional authentication - attaches user if token is valid, but doesn't require it
   */
  optionalAuth = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          return next();
        }

        const validation = this.authService.validateToken(token);
        if (!validation.valid || !validation.payload) {
          return next();
        }

        const session = await this.authService.getSession(validation.payload.sessionId);
        if (!session) {
          return next();
        }

        const user = await this.authService.getUserById(validation.payload.userId);
        if (!user || !user.isActive || user.isSuspended) {
          return next();
        }

        // Attach user to request
        req.user = {
          _id: user._id,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          role: user.role,
          profile: user.profile,
          settings: user.settings,
          isActive: user.isActive,
          isSuspended: user.isSuspended,
          suspensionReason: user.suspensionReason,
          subscription: user.subscription,
          stats: user.stats,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt
        };
        
        (req as AuthenticatedRequest).tokenPayload = validation.payload;

        next();
      } catch (error) {
        logger.debug('Optional auth failed, continuing without authentication', { error });
        next();
      }
    };
  };

  /**
   * Require specific role
   */
  requireRole = (allowedRoles: string | string[]) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      if (!roles.includes(req.user.role)) {
        logger.warn('Insufficient privileges', {
          userId: req.user._id,
          userRole: req.user.role,
          requiredRoles: roles,
          url: req.url,
          method: req.method,
          requestId: req.requestId
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient privileges',
          code: 'INSUFFICIENT_PRIVILEGES',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      next();
    };
  };

  /**
   * Require email verification
   */
  requireEmailVerification = () => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      if (!req.user.emailVerified) {
        return res.status(403).json({
          success: false,
          error: 'Email verification required',
          code: 'EMAIL_VERIFICATION_REQUIRED',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      next();
    };
  };

  /**
   * Require Tuya connection
   */
  requireTuyaConnection = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      try {
        // Get full user with auth info to check Tuya connection
        const fullUser = await this.authService.getUserById(req.user._id);
        if (!fullUser) {
          return res.status(401).json({
            success: false,
            error: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          });
        }

        const tuyaAuth = fullUser.auth.find(auth => auth.provider === 'tuya');
        if (!tuyaAuth || !tuyaAuth.accessToken) {
          return res.status(403).json({
            success: false,
            error: 'Tuya account connection required',
            code: 'TUYA_CONNECTION_REQUIRED',
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          });
        }

        // Check if token is expired
        if (tuyaAuth.tokenExpiresAt && tuyaAuth.tokenExpiresAt < new Date()) {
          return res.status(403).json({
            success: false,
            error: 'Tuya authentication expired, please reconnect',
            code: 'TUYA_TOKEN_EXPIRED',
            timestamp: new Date().toISOString(),
            requestId: req.requestId
          });
        }

        next();
      } catch (error) {
        logger.error('Failed to check Tuya connection', { 
          userId: req.user._id, 
          error,
          requestId: req.requestId
        });

        res.status(500).json({
          success: false,
          error: 'Failed to verify Tuya connection',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }
    };
  };

  /**
   * Extract token from request headers
   */
  private extractToken(req: Request): string | null {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      return null;
    }

    // Support both "Bearer token" and "token" formats
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Direct token (for backward compatibility)
    return authHeader;
  }
}

/**
 * Rate limiting middleware for authentication endpoints
 */
export const createAuthRateLimit = (windowMs: number = 15 * 60 * 1000, max: number = 5) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString()
    },
    skip: (req) => {
      // Skip rate limiting in development
      return config.isDevelopment;
    },
    keyGenerator: (req) => {
      // Rate limit by IP address
      return req.ip;
    },
    onLimitReached: (req) => {
      logger.warn('Auth rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method
      });
    }
  });
};

/**
 * CSRF protection middleware for state-changing operations
 */
export const csrfProtection = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF protection for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Skip in development
    if (config.isDevelopment) {
      return next();
    }

    const token = req.get('X-CSRF-Token') || req.body._csrf;
    const sessionToken = req.session?.csrfToken;

    if (!token || !sessionToken || token !== sessionToken) {
      logger.warn('CSRF token mismatch', {
        providedToken: token?.substring(0, 10),
        url: req.url,
        method: req.method,
        ip: req.ip,
        requestId: req.requestId
      });

      return res.status(403).json({
        success: false,
        error: 'CSRF token mismatch',
        code: 'CSRF_MISMATCH',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    }

    next();
  };
};

/**
 * Security headers middleware
 */
export const securityHeaders = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent XSS attacks
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // HTTPS enforcement in production
    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
  };
};

/**
 * Request ID middleware for tracking
 */
export const requestId = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.requestId = req.get('X-Request-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', req.requestId);
    next();
  };
};

export default AuthMiddleware;