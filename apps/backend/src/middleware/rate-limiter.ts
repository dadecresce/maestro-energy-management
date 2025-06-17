import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { CacheManager } from '@/services/cache';
import { config } from '@/config/environment';
import logger from '@/config/logger';
import { ApiError } from '@/utils/errors';

/**
 * Rate Limiting Configuration
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * Enhanced Rate Limiter with Redis backing
 */
export class RateLimiter {
  private cache: CacheManager;

  constructor(cache: CacheManager) {
    this.cache = cache;
  }

  /**
   * Create rate limiter middleware
   */
  create(config: RateLimitConfig) {
    return rateLimit({
      windowMs: config.windowMs,
      max: config.maxRequests,
      message: {
        success: false,
        error: config.message || 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000),
        timestamp: new Date().toISOString()
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      handler: this.rateLimitHandler,
      store: this.createRedisStore(config.windowMs)
    });
  }

  /**
   * Create speed limiter (progressive delays)
   */
  createSpeedLimiter(windowMs: number, delayAfter: number, maxDelayMs: number = 1000) {
    return slowDown({
      windowMs,
      delayAfter,
      delayMs: 250, // Initial delay
      maxDelayMs,
      skipFailedRequests: true,
      skipSuccessfulRequests: true,
      keyGenerator: this.defaultKeyGenerator
    });
  }

  /**
   * Rate limit handler with logging
   */
  private rateLimitHandler = (req: Request, res: Response): void => {
    const clientInfo = {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?._id || 'anonymous',
      endpoint: `${req.method} ${req.route?.path || req.path}`,
      requestId: req.requestId
    };

    logger.warn('Rate limit exceeded', clientInfo);

    // Log security event for potential abuse
    if (this.isHighRiskEndpoint(req)) {
      logger.error('Rate limit exceeded on high-risk endpoint', {
        ...clientInfo,
        securityEvent: true,
        riskLevel: 'high'
      });
    }

    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(req.rateLimit?.resetTime || Date.now() + 60000),
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  };

  /**
   * Default key generator (IP + User ID if available)
   */
  private defaultKeyGenerator = (req: Request): string => {
    const userId = req.user?._id;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  };

  /**
   * Create Redis store for rate limiting
   */
  private createRedisStore(windowMs: number) {
    if (!this.cache) {
      logger.warn('Cache not available, falling back to memory store for rate limiting');
      return undefined; // Will use default memory store
    }

    // Custom Redis store implementation
    return {
      incr: async (key: string): Promise<{ totalHits: number; resetTime: Date }> => {
        const redisKey = `rate_limit:${key}`;
        const ttl = Math.ceil(windowMs / 1000);
        
        try {
          const current = await this.cache.get(redisKey) || '0';
          const hits = parseInt(current) + 1;
          
          await this.cache.set(redisKey, hits.toString(), ttl);
          
          return {
            totalHits: hits,
            resetTime: new Date(Date.now() + windowMs)
          };
        } catch (error) {
          logger.error('Redis rate limit store error', { error, key });
          throw error;
        }
      },
      
      decrement: async (key: string): Promise<void> => {
        const redisKey = `rate_limit:${key}`;
        try {
          const current = await this.cache.get(redisKey);
          if (current) {
            const hits = Math.max(0, parseInt(current) - 1);
            if (hits === 0) {
              await this.cache.del(redisKey);
            } else {
              await this.cache.set(redisKey, hits.toString(), 3600); // 1 hour TTL
            }
          }
        } catch (error) {
          logger.error('Redis rate limit decrement error', { error, key });
        }
      },
      
      resetKey: async (key: string): Promise<void> => {
        const redisKey = `rate_limit:${key}`;
        try {
          await this.cache.del(redisKey);
        } catch (error) {
          logger.error('Redis rate limit reset error', { error, key });
        }
      }
    };
  }

  /**
   * Check if endpoint is high-risk
   */
  private isHighRiskEndpoint(req: Request): boolean {
    const highRiskPaths = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/devices/command'
    ];
    
    return highRiskPaths.some(path => req.path.includes(path));
  }
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const createRateLimiters = (cache: CacheManager) => {
  const rateLimiter = new RateLimiter(cache);

  return {
    // General API rate limiter
    general: rateLimiter.create({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000, // Limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP'
    }),

    // Authentication endpoints (stricter)
    auth: rateLimiter.create({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10, // Limit each IP to 10 auth requests per windowMs
      message: 'Too many authentication attempts',
      keyGenerator: (req: Request) => {
        // Rate limit by IP for auth endpoints
        return `auth:${req.ip}`;
      }
    }),

    // Password reset (very strict)
    passwordReset: rateLimiter.create({
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 3, // Only 3 password reset attempts per hour
      message: 'Too many password reset attempts'
    }),

    // Device commands (moderate)
    deviceCommand: rateLimiter.create({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60, // 60 commands per minute
      message: 'Too many device commands',
      keyGenerator: (req: Request) => {
        const userId = req.user?._id;
        return userId ? `device_cmd:${userId}` : `device_cmd:${req.ip}`;
      }
    }),

    // File uploads (if implemented)
    upload: rateLimiter.create({
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 50, // 50 uploads per hour
      message: 'Too many upload requests'
    }),

    // Public endpoints (more lenient)
    public: rateLimiter.create({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100, // 100 requests per 15 minutes for public endpoints
      message: 'Too many requests to public endpoints'
    }),

    // Speed limiter for heavy operations
    slowDown: rateLimiter.createSpeedLimiter(
      60 * 1000, // 1 minute window
      10, // Start slowing down after 10 requests
      5000 // Max delay of 5 seconds
    )
  };
};

/**
 * Advanced rate limiting with user-based quotas
 */
export const createUserBasedRateLimiter = (cache: CacheManager) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user._id;
    const userRole = req.user.role;
    
    // Different limits based on user role
    const limits = {
      admin: { requests: 10000, window: 15 * 60 * 1000 },
      premium: { requests: 5000, window: 15 * 60 * 1000 },
      user: { requests: 1000, window: 15 * 60 * 1000 },
      trial: { requests: 100, window: 15 * 60 * 1000 }
    };

    const userLimit = limits[userRole as keyof typeof limits] || limits.user;
    const key = `user_quota:${userId}`;
    
    try {
      const current = await cache.get(key) || '0';
      const requests = parseInt(current) + 1;
      
      if (requests > userLimit.requests) {
        logger.warn('User quota exceeded', {
          userId,
          userRole,
          requests,
          limit: userLimit.requests
        });

        return res.status(429).json({
          success: false,
          error: 'User quota exceeded',
          code: 'USER_QUOTA_EXCEEDED',
          quota: {
            used: requests - 1,
            limit: userLimit.requests,
            resetTime: new Date(Date.now() + userLimit.window)
          },
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      // Update counter
      await cache.set(key, requests.toString(), Math.ceil(userLimit.window / 1000));
      
      // Add quota info to response headers
      res.set({
        'X-Quota-Used': requests.toString(),
        'X-Quota-Limit': userLimit.requests.toString(),
        'X-Quota-Reset': new Date(Date.now() + userLimit.window).toISOString()
      });

      next();
    } catch (error) {
      logger.error('User quota check failed', { error, userId });
      // Don't block requests if quota check fails
      next();
    }
  };
};

/**
 * IP-based security rate limiter
 */
export const createSecurityRateLimiter = (cache: CacheManager) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip;
    const securityKey = `security:${ip}`;
    
    try {
      // Check if IP is temporarily blocked
      const blocked = await cache.get(`blocked:${ip}`);
      if (blocked) {
        logger.warn('Blocked IP attempted access', { ip });
        return res.status(429).json({
          success: false,
          error: 'IP temporarily blocked due to suspicious activity',
          code: 'IP_BLOCKED',
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }

      // Track failed attempts
      if (res.statusCode >= 400) {
        const failures = await cache.get(securityKey) || '0';
        const failureCount = parseInt(failures) + 1;
        
        if (failureCount >= 20) { // Block after 20 failures in 1 hour
          await cache.set(`blocked:${ip}`, 'true', 3600); // Block for 1 hour
          logger.error('IP blocked due to excessive failures', { ip, failures: failureCount });
        } else {
          await cache.set(securityKey, failureCount.toString(), 3600);
        }
      }

      next();
    } catch (error) {
      logger.error('Security rate limiter error', { error, ip });
      next();
    }
  };
};

export default RateLimiter;