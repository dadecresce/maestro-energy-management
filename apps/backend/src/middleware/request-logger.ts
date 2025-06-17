import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/config/logger';
import { config } from '@/config/environment';

/**
 * Request logging and monitoring middleware
 */
export interface RequestLogData {
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  ip: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  contentLength?: number;
  error?: string;
}

/**
 * Request ID middleware - assigns unique ID to each request
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const id = uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};

/**
 * Request logger middleware with performance monitoring
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const startHrTime = process.hrtime.bigint();
  
  // Capture request data
  const logData: RequestLogData = {
    requestId: req.requestId || 'unknown',
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    startTime
  };

  // Log request start (in development only to avoid spam)
  if (config.nodeEnv === 'development') {
    logger.debug('Request started', {
      ...logData,
      query: req.query,
      body: sanitizeBody(req.body),
      headers: sanitizeHeaders(req.headers)
    });
  }

  // Override res.end to capture response data
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const endTime = Date.now();
    const endHrTime = process.hrtime.bigint();
    const duration = endTime - startTime;
    const preciseDuration = Number(endHrTime - startHrTime) / 1000000; // Convert to milliseconds

    logData.endTime = endTime;
    logData.duration = duration;
    logData.statusCode = res.statusCode;
    logData.contentLength = res.get('Content-Length') ? parseInt(res.get('Content-Length')!) : undefined;
    logData.userId = req.user?._id;

    // Determine log level based on status code and duration
    let logLevel = 'info';
    if (res.statusCode >= 500) {
      logLevel = 'error';
    } else if (res.statusCode >= 400) {
      logLevel = 'warn';
    } else if (duration > 5000) { // Slow requests (> 5s)
      logLevel = 'warn';
    }

    // Enhanced log data for slow or error requests
    const enhancedLogData = {
      ...logData,
      preciseDuration,
      ...(res.statusCode >= 400 && {
        errorResponse: chunk ? sanitizeResponse(chunk) : undefined
      }),
      ...(duration > 1000 && {
        performance: {
          slow: true,
          threshold: '1s'
        }
      })
    };

    // Log request completion
    logger[logLevel as keyof typeof logger]('Request completed', enhancedLogData);

    // Track metrics
    trackRequestMetrics(logData, preciseDuration);

    // Call original end function
    originalEnd.call(this, chunk, encoding, cb);
  };

  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // HSTS in production
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // API-specific headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Service', 'Maestro Energy Management');

  next();
};

/**
 * CORS middleware with dynamic origin validation
 */
export const corsHandler = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.get('Origin');
  const allowedOrigins = config.cors?.allowedOrigins || ['http://localhost:3000'];
  
  // Check if origin is allowed
  if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
};

/**
 * Request size limiter
 */
export const requestSizeLimit = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const sizeBytes = parseInt(contentLength);
      const maxBytes = parseSize(maxSize);
      
      if (sizeBytes > maxBytes) {
        logger.warn('Request size limit exceeded', {
          requestId: req.requestId,
          contentLength: sizeBytes,
          maxSize: maxBytes,
          ip: req.ip
        });

        return res.status(413).json({
          success: false,
          error: 'Request entity too large',
          code: 'PAYLOAD_TOO_LARGE',
          maxSize,
          timestamp: new Date().toISOString(),
          requestId: req.requestId
        });
      }
    }

    next();
  };
};

/**
 * API version handler
 */
export const apiVersionHandler = (req: Request, res: Response, next: NextFunction): void => {
  const acceptedVersion = req.get('Accept-Version') || req.query.version as string;
  const currentVersion = '1.0.0';
  
  // Validate API version if specified
  if (acceptedVersion && !isVersionSupported(acceptedVersion)) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported API version',
      code: 'UNSUPPORTED_VERSION',
      requestedVersion: acceptedVersion,
      supportedVersions: ['1.0.0'],
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });
  }

  // Set current version in response
  res.setHeader('X-API-Version', currentVersion);
  next();
};

/**
 * Request context middleware - adds useful data to request object
 */
export const requestContext = (req: Request, res: Response, next: NextFunction): void => {
  // Add request metadata
  (req as any).context = {
    startTime: Date.now(),
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    path: req.path,
    query: req.query,
    isApi: req.path.startsWith('/api/'),
    isPublic: isPublicEndpoint(req.path),
    isMobile: isMobileUserAgent(req.get('User-Agent')),
    country: req.get('CF-IPCountry'), // Cloudflare header
    timestamp: new Date().toISOString()
  };

  next();
};

// Helper functions
function sanitizeBody(body: any): any {
  if (!body) return body;
  
  const sensitiveFields = ['password', 'token', 'secret', 'auth', 'authorization'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function sanitizeHeaders(headers: any): any {
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  const sanitized = { ...headers };
  
  for (const header of sensitiveHeaders) {
    if (header in sanitized) {
      sanitized[header] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function sanitizeResponse(chunk: any): any {
  if (typeof chunk === 'string') {
    try {
      const parsed = JSON.parse(chunk);
      return sanitizeBody(parsed);
    } catch {
      return '[NON-JSON]';
    }
  }
  return sanitizeBody(chunk);
}

function trackRequestMetrics(logData: RequestLogData, preciseDuration: number): void {
  // This would integrate with a metrics collection system like Prometheus
  // For now, we'll just log performance metrics
  
  if (logData.duration && logData.duration > 1000) {
    logger.warn('Slow request detected', {
      requestId: logData.requestId,
      url: logData.url,
      duration: logData.duration,
      preciseDuration,
      statusCode: logData.statusCode
    });
  }

  // Track error rates
  if (logData.statusCode && logData.statusCode >= 500) {
    logger.error('Server error tracked', {
      requestId: logData.requestId,
      url: logData.url,
      statusCode: logData.statusCode,
      userId: logData.userId
    });
  }
}

function parseSize(size: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg]?b)$/);
  if (!match) return 0;
  
  const [, value, unit] = match;
  return parseInt(value) * units[unit];
}

function isVersionSupported(version: string): boolean {
  const supportedVersions = ['1.0.0', '1.0', '1'];
  return supportedVersions.includes(version);
}

function isPublicEndpoint(path: string): boolean {
  const publicPaths = [
    '/api/v1/health',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/forgot-password',
    '/api/docs'
  ];
  
  return publicPaths.some(publicPath => path.startsWith(publicPath));
}

function isMobileUserAgent(userAgent?: string): boolean {
  if (!userAgent) return false;
  
  const mobileKeywords = ['Mobile', 'Android', 'iPhone', 'iPad', 'iPod', 'Windows Phone'];
  return mobileKeywords.some(keyword => userAgent.includes(keyword));
}

export default {
  requestId,
  requestLogger,
  securityHeaders,
  corsHandler,
  requestSizeLimit,
  apiVersionHandler,
  requestContext
};