import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from './environment';

/**
 * Custom log format for better readability
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

/**
 * Development log format (more human-readable)
 */
const devLogFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

/**
 * Create transport configurations
 */
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    level: config.logging.level,
    format: config.isDevelopment ? devLogFormat : logFormat,
    handleExceptions: true,
    handleRejections: true,
  }),
];

/**
 * Add file transports for production
 */
if (config.logging.fileEnabled && (config.isProduction || config.isDevelopment)) {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: logFormat,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      handleExceptions: true,
      handleRejections: true,
      zippedArchive: true,
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      zippedArchive: true,
    })
  );

  // Access logs (HTTP requests)
  transports.push(
    new DailyRotateFile({
      filename: 'logs/access-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      zippedArchive: true,
    })
  );
}

/**
 * Create the logger instance
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'maestro-backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.nodeEnv,
  },
  transports,
  exitOnError: false,
});

/**
 * Create child loggers for different modules
 */
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

/**
 * Express.js request logger middleware
 */
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  // Log request
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });
  
  // Capture response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - start;
    
    logger.http('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || 0,
    });
    
    originalEnd.call(res, chunk, encoding);
  };
  
  next();
};

/**
 * Error logger for uncaught exceptions and unhandled rejections
 */
export const setupErrorLogging = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason,
      promise,
    });
  });
  
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
};

/**
 * Log application startup information
 */
export const logStartup = () => {
  logger.info('Maestro Backend Starting', {
    nodeVersion: process.version,
    platform: process.platform,
    environment: config.nodeEnv,
    port: config.port,
    mongoUri: config.mongodb.uri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
    redisUrl: config.redis.url.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
  });
};

/**
 * Performance monitoring logger
 */
export class PerformanceLogger {
  private static timers: Map<string, number> = new Map();
  
  static start(operation: string): void {
    this.timers.set(operation, Date.now());
  }
  
  static end(operation: string, metadata?: any): void {
    const startTime = this.timers.get(operation);
    if (startTime) {
      const duration = Date.now() - startTime;
      logger.debug('Performance', {
        operation,
        duration: `${duration}ms`,
        ...metadata,
      });
      this.timers.delete(operation);
    }
  }
  
  static measure<T>(operation: string, fn: () => T, metadata?: any): T {
    this.start(operation);
    try {
      const result = fn();
      this.end(operation, metadata);
      return result;
    } catch (error) {
      this.end(operation, { ...metadata, error: true });
      throw error;
    }
  }
  
  static async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: any
  ): Promise<T> {
    this.start(operation);
    try {
      const result = await fn();
      this.end(operation, metadata);
      return result;
    } catch (error) {
      this.end(operation, { ...metadata, error: true });
      throw error;
    }
  }
}

/**
 * Security event logger
 */
export const securityLogger = {
  authSuccess: (userId: string, method: string, ip: string) => {
    logger.info('Authentication Success', {
      userId,
      method,
      ip,
      event: 'auth_success',
    });
  },
  
  authFailure: (method: string, ip: string, reason: string) => {
    logger.warn('Authentication Failure', {
      method,
      ip,
      reason,
      event: 'auth_failure',
    });
  },
  
  rateLimitHit: (ip: string, endpoint: string) => {
    logger.warn('Rate Limit Hit', {
      ip,
      endpoint,
      event: 'rate_limit',
    });
  },
  
  suspiciousActivity: (ip: string, activity: string, metadata?: any) => {
    logger.warn('Suspicious Activity', {
      ip,
      activity,
      event: 'suspicious_activity',
      ...metadata,
    });
  },
};

/**
 * Device operation logger
 */
export const deviceLogger = {
  command: (deviceId: string, command: string, success: boolean, duration?: number) => {
    logger.info('Device Command', {
      deviceId,
      command,
      success,
      duration: duration ? `${duration}ms` : undefined,
      event: 'device_command',
    });
  },
  
  discovery: (protocol: string, deviceCount: number, duration?: number) => {
    logger.info('Device Discovery', {
      protocol,
      deviceCount,
      duration: duration ? `${duration}ms` : undefined,
      event: 'device_discovery',
    });
  },
  
  statusUpdate: (deviceId: string, status: string, source: string) => {
    logger.debug('Device Status Update', {
      deviceId,
      status,
      source,
      event: 'status_update',
    });
  },
  
  error: (deviceId: string, operation: string, error: string) => {
    logger.error('Device Error', {
      deviceId,
      operation,
      error,
      event: 'device_error',
    });
  },
};

export default logger;