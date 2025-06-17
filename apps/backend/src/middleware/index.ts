import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import 'express-async-errors';

import { config } from '@/config/environment';
import logger, { requestLogger, securityLogger } from '@/config/logger';
import { ApiError } from '@/utils/errors';

/**
 * Security Middleware Configuration
 */
export const setupSecurityMiddleware = (app: Application): void => {
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow for WebSocket connections
  }));

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = config.cors.origin.split(',').map(o => o.trim());
      
      // In development, allow all origins
      if (config.isDevelopment) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.api.rateLimit.windowMs,
    max: config.api.rateLimit.maxRequests,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      securityLogger.rateLimitHit(req.ip || 'unknown', req.path);
      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString(),
      });
    },
  });

  app.use('/api/', limiter);
};

/**
 * General Purpose Middleware Configuration
 */
export const setupGeneralMiddleware = (app: Application): void => {
  // Request parsing
  app.use(express.json({ 
    limit: config.api.maxRequestSize,
    strict: true,
  }));
  
  app.use(express.urlencoded({ 
    extended: true, 
    limit: config.api.maxRequestSize,
  }));

  // Compression
  app.use(compression({
    level: 6,
    threshold: 1024, // Only compress responses larger than 1KB
    filter: (req, res) => {
      // Don't compress responses if the request includes 'x-no-compression'
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use compression filter default
      return compression.filter(req, res);
    },
  }));

  // Request ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || 
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });
};

/**
 * Logging Middleware Configuration
 */
export const setupLoggingMiddleware = (app: Application): void => {
  if (config.development.enableRequestLogging) {
    // Morgan HTTP request logger
    app.use(morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.http(message.trim());
        },
      },
      skip: (req, res) => {
        // Skip logging for health check endpoints
        return req.path === '/health' || req.path === '/api/health';
      },
    }));

    // Custom request logger
    app.use(requestLogger);
  }
};

/**
 * Request Timeout Middleware
 */
export const setupTimeoutMiddleware = (app: Application): void => {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Set timeout for all requests
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          method: req.method,
          url: req.url,
          timeout: config.api.requestTimeout,
        });
        
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          code: 'REQUEST_TIMEOUT',
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }, config.api.requestTimeout);

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  });
};

/**
 * Error Handling Middleware
 */
export const setupErrorHandling = (app: Application): void => {
  // 404 handler - must be after all routes
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Route ${req.method} ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Log the error
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      requestId: req.requestId,
      body: req.body,
      headers: req.headers,
    });

    // Handle specific error types
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        code: err.code,
        details: err.details,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: err.details || err.message,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }

    // Handle MongoDB errors
    if (err.name === 'MongoError' || err.name === 'MongoServerError') {
      logger.error('MongoDB error', {
        error: err.message,
        code: err.code,
        requestId: req.requestId,
      });
      
      return res.status(500).json({
        success: false,
        error: 'Database error',
        code: 'DATABASE_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }

    // Handle CORS errors
    if (err.message && err.message.includes('CORS')) {
      return res.status(403).json({
        success: false,
        error: 'CORS policy violation',
        code: 'CORS_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }

    // Handle syntax errors (malformed JSON, etc.)
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }

    // Default error response
    const statusCode = err.statusCode || err.status || 500;
    const message = config.isProduction ? 'Internal server error' : err.message;

    res.status(statusCode).json({
      success: false,
      error: message,
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      ...(config.isDevelopment && { stack: err.stack }),
    });
  });
};

/**
 * Health Check Middleware
 */
export const setupHealthCheck = (app: Application): void => {
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0',
      },
    });
  });
};

/**
 * Apply all middleware to the Express application
 */
export const setupAllMiddleware = (app: Application): void => {
  // Order is important!
  setupHealthCheck(app);      // Health checks first (no other middleware needed)
  setupSecurityMiddleware(app);
  setupGeneralMiddleware(app);
  setupLoggingMiddleware(app);
  setupTimeoutMiddleware(app);
  
  // Routes would be added here
  
  // Error handling must be last
  setupErrorHandling(app);
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: any; // Will be properly typed when auth is implemented
    }
  }
}