import { MongoClient, Db, Collection } from 'mongodb';
import { config } from '@/config/environment';
import logger from '@/config/logger';
import { DatabaseError, DatabaseConnectionError } from '@/utils/errors';

/**
 * Database Manager
 * 
 * Manages MongoDB connection and provides access to collections
 * with proper error handling and connection monitoring
 */
export class DatabaseManager {
  private client?: MongoClient;
  private db?: Db;
  private isConnected = false;
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 5000; // 5 seconds

  constructor() {
    logger.info('Database manager initialized');
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to MongoDB...', {
        uri: config.mongodb.uri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
        dbName: config.mongodb.dbName,
      });

      this.client = new MongoClient(config.mongodb.uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4, // Use IPv4
      });

      await this.client.connect();
      
      // Test the connection
      await this.client.db(config.mongodb.dbName).admin().ping();
      
      this.db = this.client.db(config.mongodb.dbName);
      this.isConnected = true;
      this.connectionRetries = 0;

      logger.info('MongoDB connected successfully', {
        dbName: config.mongodb.dbName,
      });

      // Setup connection event handlers
      this.setupEventHandlers();

      // Setup indexes
      await this.setupIndexes();

    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;

      logger.error('MongoDB connection failed', {
        error: error instanceof Error ? error.message : error,
        attempt: this.connectionRetries,
        maxRetries: this.maxRetries,
      });

      if (this.connectionRetries < this.maxRetries) {
        logger.info(`Retrying connection in ${this.retryDelay}ms...`);
        setTimeout(() => this.connect(), this.retryDelay);
        return;
      }

      throw new DatabaseConnectionError(
        `Failed to connect to MongoDB after ${this.maxRetries} attempts`,
        { originalError: error }
      );
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.isConnected = false;
        logger.info('MongoDB disconnected successfully');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB', { error });
      throw new DatabaseError('Failed to disconnect from MongoDB', { originalError: error });
    }
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.isConnected && !!this.client && !!this.db;
  }

  /**
   * Get database instance
   */
  getDb(): Db {
    if (!this.db) {
      throw new DatabaseError('Database not connected');
    }
    return this.db;
  }

  /**
   * Get collection with type safety
   */
  getCollection<T = any>(name: string): Collection<T> {
    const db = this.getDb();
    return db.collection<T>(name);
  }

  /**
   * Get users collection
   */
  getUsersCollection() {
    return this.getCollection('users');
  }

  /**
   * Get devices collection
   */
  getDevicesCollection() {
    return this.getCollection('devices');
  }

  /**
   * Get device commands collection
   */
  getDeviceCommandsCollection() {
    return this.getCollection('device_commands');
  }

  /**
   * Get user preferences collection
   */
  getUserPreferencesCollection() {
    return this.getCollection('user_preferences');
  }

  /**
   * Get sessions collection
   */
  getSessionsCollection() {
    return this.getCollection('sessions');
  }

  /**
   * Execute transaction
   */
  async withTransaction<T>(operation: (session: any) => Promise<T>): Promise<T> {
    if (!this.client) {
      throw new DatabaseError('Database not connected');
    }

    const session = this.client.startSession();
    
    try {
      let result: T;
      
      await session.withTransaction(async () => {
        result = await operation(session);
      });

      return result!;
    } catch (error) {
      logger.error('Transaction failed', { error });
      throw new DatabaseError('Transaction failed', { originalError: error });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      if (!this.isConnected || !this.client || !this.db) {
        return {
          status: 'unhealthy',
          details: { connected: false, error: 'Not connected' },
        };
      }

      // Ping the database
      await this.db.admin().ping();
      
      // Get server status
      const serverStatus = await this.db.admin().serverStatus();
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          dbName: this.db.databaseName,
          serverVersion: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections,
        },
      };
    } catch (error) {
      logger.error('Database health check failed', { error });
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
   * Setup connection event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('serverOpening', () => {
      logger.debug('MongoDB server connection opening');
    });

    this.client.on('serverClosed', () => {
      logger.warn('MongoDB server connection closed');
      this.isConnected = false;
    });

    this.client.on('error', (error) => {
      logger.error('MongoDB client error', { error });
      this.isConnected = false;
    });

    this.client.on('timeout', () => {
      logger.warn('MongoDB operation timeout');
    });

    this.client.on('close', () => {
      logger.info('MongoDB client closed');
      this.isConnected = false;
    });
  }

  /**
   * Setup database indexes for optimal performance
   */
  private async setupIndexes(): Promise<void> {
    try {
      logger.info('Setting up database indexes...');

      // Users collection indexes
      const usersCollection = this.getUsersCollection();
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      await usersCollection.createIndex({ createdAt: 1 });
      await usersCollection.createIndex({ lastLoginAt: 1 });

      // Devices collection indexes
      const devicesCollection = this.getDevicesCollection();
      await devicesCollection.createIndex({ userId: 1 });
      await devicesCollection.createIndex({ deviceId: 1, userId: 1 }, { unique: true });
      await devicesCollection.createIndex({ protocol: 1 });
      await devicesCollection.createIndex({ deviceType: 1 });
      await devicesCollection.createIndex({ isOnline: 1 });
      await devicesCollection.createIndex({ status: 1 });
      await devicesCollection.createIndex({ lastSeenAt: 1 });
      await devicesCollection.createIndex({ createdAt: 1 });

      // Device commands collection indexes
      const commandsCollection = this.getDeviceCommandsCollection();
      await commandsCollection.createIndex({ deviceId: 1 });
      await commandsCollection.createIndex({ userId: 1 });
      await commandsCollection.createIndex({ timestamp: 1 });
      await commandsCollection.createIndex({ command: 1 });
      await commandsCollection.createIndex({ success: 1 });

      // User preferences collection indexes
      const preferencesCollection = this.getUserPreferencesCollection();
      await preferencesCollection.createIndex({ userId: 1 }, { unique: true });

      // Sessions collection indexes
      const sessionsCollection = this.getSessionsCollection();
      await sessionsCollection.createIndex({ sessionId: 1 }, { unique: true });
      await sessionsCollection.createIndex({ userId: 1 });
      await sessionsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

      logger.info('Database indexes setup completed');

    } catch (error) {
      logger.error('Failed to setup database indexes', { error });
      // Don't throw error as this is not critical for basic functionality
    }
  }

  /**
   * Create compound queries with proper error handling
   */
  async findWithPagination<T>(
    collection: Collection<T>,
    filter: any = {},
    options: {
      page?: number;
      limit?: number;
      sort?: any;
      projection?: any;
    } = {}
  ): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    try {
      const page = Math.max(1, options.page || 1);
      const limit = Math.max(1, Math.min(100, options.limit || 20));
      const skip = (page - 1) * limit;

      // Get total count and data in parallel
      const [total, data] = await Promise.all([
        collection.countDocuments(filter),
        collection
          .find(filter, { projection: options.projection })
          .sort(options.sort || { createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('Pagination query failed', { error, filter, options });
      throw new DatabaseError('Failed to execute paginated query', { originalError: error });
    }
  }
}

export default DatabaseManager;