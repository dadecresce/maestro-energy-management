import { Request, Response, NextFunction } from 'express';
import { ApiError, ValidationError, AuthenticationError, ForbiddenError } from '@/utils/errors';
import logger from '@/config/logger';
import { config } from '@/config/environment';

/**
 * Global Error Handler Middleware
 * 
 * Handles all errors in a consistent format with proper logging
 * and security considerations
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle if response was already sent
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || 'unknown';
  const userId = req.user?._id || 'anonymous';
  const method = req.method;
  const url = req.originalUrl;

  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  // Handle known error types
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ValidationError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.message;
    details = err.details;
  } else if (err instanceof AuthenticationError) {
    statusCode = 401;
    errorCode = 'AUTHENTICATION_ERROR';
    message = err.message;
  } else if (err instanceof ForbiddenError) {
    statusCode = 403;
    errorCode = 'FORBIDDEN_ERROR';
    message = err.message;
  } else if (err.name === 'ValidationError') {
    // Mongoose/Joi validation errors
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = parseValidationError(err);
  } else if (err.name === 'CastError') {
    // MongoDB ObjectId cast errors
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    // MongoDB errors
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Database operation failed';
    
    // Handle specific MongoDB errors
    if ((err as any).code === 11000) {
      statusCode = 409;
      errorCode = 'DUPLICATE_KEY';
      message = 'Resource already exists';
      details = parseDuplicateKeyError(err);
    }
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // JSON parsing errors
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  }

  // Log error with appropriate level
  const logData = {
    error: {
      name: err.name,
      message: err.message,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
      statusCode,
      errorCode
    },
    request: {
      method,
      url,
      userId,
      requestId,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      body: sanitizeLogData(req.body),
      query: req.query,
      params: req.params
    }
  };

  if (statusCode >= 500) {
    logger.error('Server error', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client error', logData);
  } else {
    logger.info('Request error', logData);
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: message,
    code: errorCode,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
    requestId,
    // Include stack trace in development
    ...(config.nodeEnv === 'development' && statusCode >= 500 && {
      stack: err.stack
    })
  };

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found Handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const message = `Route ${req.method} ${req.originalUrl} not found`;
  
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });

  res.status(404).json({
    success: false,
    error: message,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Request timeout handler
 */
export const timeoutHandler = (timeout: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          method: req.method,
          url: req.originalUrl,
          timeout,
          requestId: req.requestId
        });

        res.status(408).json({
          success: false,
          error: 'Request timeout',
          code: 'REQUEST_TIMEOUT',
          timeout,
          timestamp: new Date().toISOString(),
          requestId: req.requestId,
        });
      }
    }, timeout);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};

// Helper functions
function parseValidationError(err: any): any {
  if (err.details) {
    // Joi validation error
    return err.details.map((detail: any) => ({
      field: detail.path?.join('.') || detail.context?.key,
      message: detail.message,
      value: detail.context?.value
    }));
  } else if (err.errors) {
    // Mongoose validation error
    return Object.keys(err.errors).map(key => ({
      field: key,
      message: err.errors[key].message,
      value: err.errors[key].value
    }));
  }
  return undefined;
}

function parseDuplicateKeyError(err: any): any {
  if (err.keyPattern) {
    const field = Object.keys(err.keyPattern)[0];
    return {
      field,
      message: `${field} already exists`,
      value: err.keyValue?.[field]
    };
  }
  return undefined;
}

function sanitizeLogData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = ['password', 'token', 'secret', 'auth', 'authorization', 'cookie'];
  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

export default errorHandler;