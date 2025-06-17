import { createClient, RedisClientType } from 'redis';
import { config } from '@/config/environment';
import logger from '@/config/logger';
import { createError } from '@/utils/errors';

/**
 * Cache Manager
 * 
 * Manages Redis connection and provides caching functionality
 * with proper error handling and connection monitoring
 */
export class CacheManager {
  private client?: RedisClientType;
  private isConnected = false;
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 5000; // 5 seconds

  constructor() {
    logger.info('Cache manager initialized');
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to Redis...', {
        url: config.redis.url.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
        db: config.redis.db,
      });

      this.client = createClient({
        url: config.redis.url,
        database: config.redis.db,
        password: config.redis.password,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries > this.maxRetries) {
              logger.error('Redis max reconnection attempts reached');
              return false;
            }
            return Math.min(retries * 1000, 5000);
          },
        },
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Connect to Redis
      await this.client.connect();
      
      // Test the connection
      await this.client.ping();
      
      this.isConnected = true;
      this.connectionRetries = 0;

      logger.info('Redis connected successfully');

    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;

      logger.error('Redis connection failed', {
        error: error instanceof Error ? error.message : error,
        attempt: this.connectionRetries,
        maxRetries: this.maxRetries,
      });

      if (this.connectionRetries < this.maxRetries) {
        logger.info(`Retrying Redis connection in ${this.retryDelay}ms...`);
        setTimeout(() => this.connect(), this.retryDelay);
        return;
      }

      throw createError.serviceUnavailable(
        `Failed to connect to Redis after ${this.maxRetries} attempts`,
        { originalError: error }
      );
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis disconnected successfully');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error });
      throw createError.internal('Failed to disconnect from Redis', { originalError: error });
    }
  }

  /**
   * Check if cache is connected
   */
  isConnected(): boolean {
    return this.isConnected && !!this.client && this.client.isReady;
  }

  /**
   * Get Redis client
   */
  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw createError.serviceUnavailable('Cache not connected');
    }
    return this.client;
  }

  /**
   * Set value with optional TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const client = this.getClient();
      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }

      logger.debug('Cache set', { key, ttl: ttlSeconds });
    } catch (error) {
      logger.error('Cache set failed', { key, error });
      throw createError.internal('Failed to set cache value', { key, originalError: error });
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const client = this.getClient();
      const value = await client.get(key);
      
      if (value === null) {
        return null;
      }

      const parsed = JSON.parse(value);
      logger.debug('Cache hit', { key });
      return parsed;
    } catch (error) {
      logger.error('Cache get failed', { key, error });
      // Don't throw error for cache misses, return null
      return null;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<number> {
    try {
      const client = this.getClient();
      const result = await client.del(key);
      
      logger.debug('Cache delete', { key, deleted: result });
      return result;
    } catch (error) {
      logger.error('Cache delete failed', { key, error });
      throw createError.internal('Failed to delete cache value', { key, originalError: error });
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists check failed', { key, error });
      return false;
    }
  }

  /**
   * Set expiration for existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.expire(key, ttlSeconds);
      return result;
    } catch (error) {
      logger.error('Cache expire failed', { key, error });
      throw createError.internal('Failed to set cache expiration', { key, originalError: error });
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const client = this.getClient();
      const values = await client.mGet(keys);
      
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      });
    } catch (error) {
      logger.error('Cache mget failed', { keys, error });
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(keyValues: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const client = this.getClient();
      
      // Use pipeline for better performance
      const pipeline = client.multi();
      
      for (const { key, value, ttl } of keyValues) {
        const serializedValue = JSON.stringify(value);
        if (ttl) {
          pipeline.setEx(key, ttl, serializedValue);
        } else {
          pipeline.set(key, serializedValue);
        }
      }
      
      await pipeline.exec();
      logger.debug('Cache mset', { count: keyValues.length });
    } catch (error) {
      logger.error('Cache mset failed', { error });
      throw createError.internal('Failed to set multiple cache values', { originalError: error });
    }
  }

  /**
   * Increment a numeric value
   */
  async incr(key: string): Promise<number> {
    try {
      const client = this.getClient();
      return await client.incr(key);
    } catch (error) {
      logger.error('Cache incr failed', { key, error });
      throw createError.internal('Failed to increment cache value', { key, originalError: error });
    }
  }

  /**
   * Increment by a specific amount
   */
  async incrBy(key: string, increment: number): Promise<number> {
    try {
      const client = this.getClient();
      return await client.incrBy(key, increment);
    } catch (error) {
      logger.error('Cache incrBy failed', { key, increment, error });
      throw createError.internal('Failed to increment cache value', { key, originalError: error });
    }
  }

  /**
   * Get keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      const client = this.getClient();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys failed', { pattern, error });
      throw createError.internal('Failed to get cache keys', { pattern, originalError: error });
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) return 0;
      
      const client = this.getClient();
      return await client.del(keys);
    } catch (error) {
      logger.error('Cache delete pattern failed', { pattern, error });
      throw createError.internal('Failed to delete cache pattern', { pattern, originalError: error });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      if (!this.isConnected || !this.client) {
        return {
          status: 'unhealthy',
          details: { connected: false, error: 'Not connected' },
        };
      }

      // Ping Redis
      const pong = await this.client.ping();
      
      if (pong !== 'PONG') {
        return {
          status: 'unhealthy',
          details: { connected: false, error: 'Ping failed' },
        };
      }

      // Get info
      const info = await this.client.info();
      const lines = info.split('\r\n');
      const serverInfo: any = {};
      
      for (const line of lines) {
        if (line.includes(':') && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          serverInfo[key] = value;
        }
      }

      return {
        status: 'healthy',
        details: {
          connected: true,
          version: serverInfo.redis_version,
          mode: serverInfo.redis_mode,
          uptime: serverInfo.uptime_in_seconds,
          connectedClients: serverInfo.connected_clients,
          usedMemory: serverInfo.used_memory_human,
        },
      };
    } catch (error) {
      logger.error('Cache health check failed', { error });
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Device-specific cache methods
   */
  
  async cacheDeviceStatus(deviceId: string, status: any): Promise<void> {
    const key = `device:status:${deviceId}`;
    await this.set(key, status, config.cache.ttl.deviceStatus);
  }

  async getDeviceStatus(deviceId: string): Promise<any> {
    const key = `device:status:${deviceId}`;
    return await this.get(key);
  }

  async cacheDeviceList(userId: string, devices: any[]): Promise<void> {
    const key = `user:devices:${userId}`;
    await this.set(key, devices, config.cache.ttl.deviceList);
  }

  async getDeviceList(userId: string): Promise<any[] | null> {
    const key = `user:devices:${userId}`;
    return await this.get(key);
  }

  async cacheUserProfile(userId: string, profile: any): Promise<void> {
    const key = `user:profile:${userId}`;
    await this.set(key, profile, config.cache.ttl.userProfile);
  }

  async getUserProfile(userId: string): Promise<any> {
    const key = `user:profile:${userId}`;
    return await this.get(key);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.deletePattern(`user:*:${userId}`);
  }

  async invalidateDeviceCache(deviceId: string): Promise<void> {
    await this.deletePattern(`device:*:${deviceId}`);
  }

  /**
   * Session management
   */
  
  async setSession(sessionId: string, sessionData: any, ttlSeconds: number): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, sessionData, ttlSeconds);
  }

  async getSession(sessionId: string): Promise<any> {
    const key = `session:${sessionId}`;
    return await this.get(key);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  /**
   * Rate limiting support
   */
  
  async incrementRateLimit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number }> {
    try {
      const client = this.getClient();
      const pipeline = client.multi();
      
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      pipeline.ttl(key);
      
      const results = await pipeline.exec();
      const count = results![0] as number;
      const ttl = results![2] as number;
      
      return { count, ttl };
    } catch (error) {
      logger.error('Rate limit increment failed', { key, error });
      throw createError.internal('Failed to increment rate limit', { key, originalError: error });
    }
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.debug('Redis client connecting');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.warn('Redis client connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }
}

export default CacheManager;