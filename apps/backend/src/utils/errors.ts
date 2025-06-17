/**
 * Custom API Error Classes
 * 
 * Provides structured error handling for the Maestro backend API
 */

/**
 * Base API Error class
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
    this.name = 'ForbiddenError';
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

/**
 * Validation Error (422)
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 422, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Too Many Requests Error (429)
 */
export class TooManyRequestsError extends ApiError {
  constructor(message: string = 'Too many requests', details?: any) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
    this.name = 'TooManyRequestsError';
  }
}

/**
 * Internal Server Error (500)
 */
export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, 'INTERNAL_ERROR', details);
    this.name = 'InternalServerError';
  }
}

/**
 * Service Unavailable Error (503)
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service unavailable', details?: any) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Device-specific errors
 */
export class DeviceError extends ApiError {
  constructor(message: string, deviceId?: string, details?: any) {
    super(message, 500, 'DEVICE_ERROR', { deviceId, ...details });
    this.name = 'DeviceError';
  }
}

export class DeviceNotFoundError extends NotFoundError {
  constructor(deviceId: string) {
    super(`Device not found: ${deviceId}`, { deviceId });
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceOfflineError extends ServiceUnavailableError {
  constructor(deviceId: string) {
    super(`Device is offline: ${deviceId}`, { deviceId });
    this.name = 'DeviceOfflineError';
  }
}

export class DeviceCommandError extends ApiError {
  constructor(deviceId: string, command: string, message: string, details?: any) {
    super(
      `Device command failed: ${message}`,
      500,
      'DEVICE_COMMAND_ERROR',
      { deviceId, command, ...details }
    );
    this.name = 'DeviceCommandError';
  }
}

/**
 * Authentication-specific errors
 */
export class AuthenticationError extends UnauthorizedError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, details);
    this.code = 'AUTHENTICATION_ERROR';
    this.name = 'AuthenticationError';
  }
}

export class TokenExpiredError extends UnauthorizedError {
  constructor(message: string = 'Token expired', details?: any) {
    super(message, details);
    this.code = 'TOKEN_EXPIRED';
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor(message: string = 'Invalid token', details?: any) {
    super(message, details);
    this.code = 'INVALID_TOKEN';
    this.name = 'InvalidTokenError';
  }
}

/**
 * Database-specific errors
 */
export class DatabaseError extends InternalServerError {
  constructor(message: string = 'Database error', details?: any) {
    super(message, details);
    this.code = 'DATABASE_ERROR';
    this.name = 'DatabaseError';
  }
}

export class DatabaseConnectionError extends ServiceUnavailableError {
  constructor(message: string = 'Database connection failed', details?: any) {
    super(message, details);
    this.code = 'DATABASE_CONNECTION_ERROR';
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends ApiError {
  constructor(
    service: string,
    message: string = 'External service error',
    statusCode: number = 502,
    details?: any
  ) {
    super(message, statusCode, 'EXTERNAL_SERVICE_ERROR', { service, ...details });
    this.name = 'ExternalServiceError';
  }
}

export class TuyaApiError extends ExternalServiceError {
  constructor(message: string, details?: any) {
    super('Tuya API', message, 502, details);
    this.code = 'TUYA_API_ERROR';
    this.name = 'TuyaApiError';
  }
}

/**
 * Protocol adapter errors
 */
export class ProtocolAdapterError extends ApiError {
  constructor(
    protocol: string,
    message: string,
    statusCode: number = 500,
    details?: any
  ) {
    super(message, statusCode, 'PROTOCOL_ADAPTER_ERROR', { protocol, ...details });
    this.name = 'ProtocolAdapterError';
  }
}

/**
 * Error factory functions
 */
export const createError = {
  badRequest: (message?: string, details?: any) => new BadRequestError(message, details),
  unauthorized: (message?: string, details?: any) => new UnauthorizedError(message, details),
  forbidden: (message?: string, details?: any) => new ForbiddenError(message, details),
  notFound: (message?: string, details?: any) => new NotFoundError(message, details),
  conflict: (message?: string, details?: any) => new ConflictError(message, details),
  validation: (message?: string, details?: any) => new ValidationError(message, details),
  tooManyRequests: (message?: string, details?: any) => new TooManyRequestsError(message, details),
  internal: (message?: string, details?: any) => new InternalServerError(message, details),
  serviceUnavailable: (message?: string, details?: any) => new ServiceUnavailableError(message, details),
  
  // Device errors
  device: (message: string, deviceId?: string, details?: any) => 
    new DeviceError(message, deviceId, details),
  deviceNotFound: (deviceId: string) => new DeviceNotFoundError(deviceId),
  deviceOffline: (deviceId: string) => new DeviceOfflineError(deviceId),
  deviceCommand: (deviceId: string, command: string, message: string, details?: any) =>
    new DeviceCommandError(deviceId, command, message, details),
  
  // Auth errors
  authentication: (message?: string, details?: any) => new AuthenticationError(message, details),
  tokenExpired: (message?: string, details?: any) => new TokenExpiredError(message, details),
  invalidToken: (message?: string, details?: any) => new InvalidTokenError(message, details),
  
  // Database errors
  database: (message?: string, details?: any) => new DatabaseError(message, details),
  databaseConnection: (message?: string, details?: any) => new DatabaseConnectionError(message, details),
  
  // External service errors
  externalService: (service: string, message?: string, statusCode?: number, details?: any) =>
    new ExternalServiceError(service, message, statusCode, details),
  tuyaApi: (message: string, details?: any) => new TuyaApiError(message, details),
  
  // Protocol adapter errors
  protocolAdapter: (protocol: string, message: string, statusCode?: number, details?: any) =>
    new ProtocolAdapterError(protocol, message, statusCode, details),
};

/**
 * Error type guards
 */
export const isApiError = (error: any): error is ApiError => {
  return error instanceof ApiError;
};

export const isDeviceError = (error: any): error is DeviceError => {
  return error instanceof DeviceError;
};

export const isAuthenticationError = (error: any): error is AuthenticationError => {
  return error instanceof AuthenticationError;
};

export const isDatabaseError = (error: any): error is DatabaseError => {
  return error instanceof DatabaseError;
};

export const isExternalServiceError = (error: any): error is ExternalServiceError => {
  return error instanceof ExternalServiceError;
};

/**
 * Error serialization for logging and API responses
 */
export const serializeError = (error: Error | ApiError) => {
  const serialized: any = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (isApiError(error)) {
    serialized.statusCode = error.statusCode;
    serialized.code = error.code;
    serialized.details = error.details;
    serialized.timestamp = error.timestamp;
  }

  return serialized;
};

/**
 * Convert unknown error to ApiError
 */
export const normalizeError = (error: unknown): ApiError => {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(error.message, 500, 'INTERNAL_ERROR', {
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new ApiError(
    typeof error === 'string' ? error : 'Unknown error occurred',
    500,
    'UNKNOWN_ERROR',
    { originalError: error }
  );
};

export default {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError,
  DeviceError,
  DeviceNotFoundError,
  DeviceOfflineError,
  DeviceCommandError,
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  DatabaseError,
  DatabaseConnectionError,
  ExternalServiceError,
  TuyaApiError,
  ProtocolAdapterError,
  createError,
  isApiError,
  isDeviceError,
  isAuthenticationError,
  isDatabaseError,
  isExternalServiceError,
  serializeError,
  normalizeError,
};