// Export all shared types for the Maestro Energy Management System

// Base types
export * from './base';

// User types
export * from './user';

// Device types
export * from './device';

// Energy types (Phase 2)
export * from './energy';

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// WebSocket Event types
export interface WebSocketEvent<T = any> {
  type: string;
  data: T;
  timestamp: string;
  userId?: string;
  deviceId?: string;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  field?: string; // For validation errors
  timestamp: string;
}

// Common filter and sort types
export interface QueryFilters {
  search?: string;
  status?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: any;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

// Configuration types
export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
  };
  websocket: {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
  };
  auth: {
    tokenKey: string;
    refreshTokenKey: string;
    sessionTimeout: number;
  };
  features: {
    enablePWA: boolean;
    enableNotifications: boolean;
    enableOfflineMode: boolean;
    enableAnalytics: boolean;
  };
}

// Utility types for better type safety
export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Type guards
export const isApiResponse = <T>(obj: any): obj is ApiResponse<T> => {
  return typeof obj === 'object' && typeof obj.success === 'boolean';
};

export const isPaginatedResponse = <T>(obj: any): obj is PaginatedResponse<T> => {
  return isApiResponse(obj) && obj.pagination && typeof obj.pagination === 'object';
};

export const isWebSocketEvent = <T>(obj: any): obj is WebSocketEvent<T> => {
  return typeof obj === 'object' && typeof obj.type === 'string' && obj.timestamp;
};