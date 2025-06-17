import mongoose from 'mongoose';
import { config } from '@/config/environment';
import logger from '@/config/logger';
import { DatabaseError, DatabaseConnectionError } from '@/utils/errors';
import { ModelRegistry } from '@/models';
import { UserService, DeviceService } from '@/services/database';

/**
 * Mongoose Database Manager
 * 
 * Manages MongoDB connection using Mongoose ODM and provides access to
 * typed models and services with proper error handling and monitoring.
 * 
 * This manager extends the existing raw MongoDB DatabaseManager with
 * Mongoose-specific functionality while maintaining compatibility.
 */
export class MongooseManager {
  private isConnected = false;
  private connectionRetries = 0;
  private maxRetries = 5;
  private retryDelay = 5000; // 5 seconds

  // Service instances
  public userService: UserService;
  public deviceService: DeviceService;

  constructor() {
    logger.info('Mongoose manager initialized');
    
    // Initialize services
    this.userService = new UserService();
    this.deviceService = new DeviceService();
    
    // Setup Mongoose event handlers
    this.setupEventHandlers();
  }

  /**
   * Connect to MongoDB using Mongoose
   */
  async connect(): Promise<void> {
    try {
      logger.info('Connecting to MongoDB with Mongoose...', {
        uri: config.mongodb.uri.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
        dbName: config.mongodb.dbName,
      });

      // Configure Mongoose settings
      mongoose.set('strictQuery', false);

      // Connection options
      const connectionOptions = {
        dbName: config.mongodb.dbName,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4, // Use IPv4
        bufferCommands: false,
        bufferMaxEntries: 0
      };

      await mongoose.connect(config.mongodb.uri, connectionOptions);
      
      this.isConnected = true;
      this.connectionRetries = 0;

      logger.info('Mongoose connected successfully', {
        dbName: config.mongodb.dbName,
        readyState: mongoose.connection.readyState
      });

    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;

      logger.error('Mongoose connection failed', {
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
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('Mongoose disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB', { error });
      throw new DatabaseError('Failed to disconnect from MongoDB', { originalError: error });
    }
  }

  /**
   * Check if database is connected
   */
  isConnectedState(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get Mongoose connection instance
   */
  getConnection(): mongoose.Connection {
    if (!this.isConnectedState()) {
      throw new DatabaseError('Database not connected');
    }
    return mongoose.connection;
  }

  /**
   * Get specific model
   */
  getModel<T extends keyof typeof ModelRegistry>(modelName: T): typeof ModelRegistry[T] {
    if (!this.isConnectedState()) {
      throw new DatabaseError('Database not connected');
    }
    return ModelRegistry[modelName];
  }

  /**
   * Execute transaction with Mongoose
   */
  async withTransaction<T>(operation: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
    if (!this.isConnectedState()) {
      throw new DatabaseError('Database not connected');
    }

    const session = await mongoose.startSession();
    
    try {
      let result: T;
      
      await session.withTransaction(async () => {
        result = await operation(session);
      });

      return result!;
    } catch (error) {
      logger.error('Mongoose transaction failed', { error });
      throw new DatabaseError('Transaction failed', { originalError: error });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Health check with Mongoose
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      if (!this.isConnectedState()) {
        return {
          status: 'unhealthy',
          details: { 
            connected: false, 
            error: 'Not connected',
            readyState: mongoose.connection.readyState
          },
        };
      }

      // Ping the database using Mongoose
      const db = mongoose.connection.db;
      await db.admin().ping();
      
      // Get connection statistics
      const stats = await db.stats();
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          dbName: mongoose.connection.db.databaseName,
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          collections: stats.collections,
          dataSize: stats.dataSize,
          indexSize: stats.indexSize,
          models: Object.keys(mongoose.models)
        },
      };
    } catch (error) {
      logger.error('Mongoose health check failed', { error });
      return {
        status: 'unhealthy',
        details: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          readyState: mongoose.connection.readyState
        },
      };
    }
  }

  /**
   * Setup Mongoose event handlers
   */
  private setupEventHandlers(): void {
    // Connection events
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      logger.error('Mongoose connection error', { error });
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('Mongoose reconnected to MongoDB');
      this.isConnected = true;
    });

    // Process events
    process.on('SIGINT', async () => {
      try {
        await this.disconnect();
        logger.info('Mongoose connection closed through app termination');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    });
  }

  /**
   * Create database indexes programmatically
   */
  async ensureIndexes(): Promise<void> {
    try {
      logger.info('Ensuring database indexes...');

      // Get all registered models
      const models = Object.values(ModelRegistry);
      
      // Create indexes for each model
      for (const model of models) {
        try {
          await model.createIndexes();
          logger.debug(`Indexes created for ${model.modelName}`);
        } catch (error) {
          logger.warn(`Failed to create indexes for ${model.modelName}`, { error });
        }
      }

      logger.info('Database indexes ensured');
    } catch (error) {
      logger.error('Failed to ensure database indexes', { error });
      throw new DatabaseError('Failed to ensure indexes', { originalError: error });
    }
  }

  /**
   * Drop database (use with caution!)
   */
  async dropDatabase(): Promise<void> {
    if (config.nodeEnv === 'production') {
      throw new DatabaseError('Cannot drop database in production environment');
    }

    try {
      await mongoose.connection.db.dropDatabase();
      logger.warn('Database dropped');
    } catch (error) {
      logger.error('Failed to drop database', { error });
      throw new DatabaseError('Failed to drop database', { originalError: error });
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    try {
      const db = mongoose.connection.db;
      const stats = await db.stats();
      
      // Get collection stats
      const collections = await db.listCollections().toArray();
      const collectionStats = {};
      
      for (const collection of collections) {
        try {
          const collStats = await db.collection(collection.name).stats();
          collectionStats[collection.name] = {
            count: collStats.count,
            size: collStats.size,
            avgObjSize: collStats.avgObjSize,
            storageSize: collStats.storageSize,
            totalIndexSize: collStats.totalIndexSize
          };
        } catch (error) {
          // Some collections might not support stats
          collectionStats[collection.name] = { error: 'Stats not available' };
        }
      }

      return {
        database: {
          name: stats.db,
          collections: stats.collections,
          objects: stats.objects,
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          indexes: stats.indexes,
          indexSize: stats.indexSize
        },
        collections: collectionStats,
        models: Object.keys(mongoose.models)
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      throw new DatabaseError('Failed to get database stats', { originalError: error });
    }
  }

  /**
   * Backup database to JSON (for development/testing)
   */
  async backupToJSON(includeCollections?: string[]): Promise<any> {
    if (config.nodeEnv === 'production') {
      throw new DatabaseError('JSON backup not recommended for production');
    }

    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      const backup = {};

      for (const collection of collections) {
        if (includeCollections && !includeCollections.includes(collection.name)) {
          continue;
        }

        try {
          const documents = await db.collection(collection.name).find({}).toArray();
          backup[collection.name] = documents;
        } catch (error) {
          logger.warn(`Failed to backup collection ${collection.name}`, { error });
          backup[collection.name] = { error: 'Backup failed' };
        }
      }

      return {
        timestamp: new Date().toISOString(),
        database: mongoose.connection.db.databaseName,
        collections: backup
      };
    } catch (error) {
      logger.error('Failed to create backup', { error });
      throw new DatabaseError('Failed to create backup', { originalError: error });
    }
  }

  /**
   * Clean up old data based on retention policies
   */
  async cleanupOldData(): Promise<{ [collection: string]: number }> {
    const results = {};

    try {
      // Clean up old sessions (older than 30 days)
      const Session = this.getModel('Session');
      const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
      const sessionsResult = await Session.deleteMany({
        $or: [
          { expiresAt: { $lt: new Date() } },
          { isActive: false, createdAt: { $lt: thirtyDaysAgo } }
        ]
      });
      results['sessions'] = sessionsResult.deletedCount;

      // Clean up old device commands (configurable retention)
      const DeviceCommand = this.getModel('DeviceCommand');
      const ninetyDaysAgo = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));
      const commandsResult = await DeviceCommand.deleteMany({
        createdAt: { $lt: ninetyDaysAgo },
        status: { $in: ['completed', 'failed', 'cancelled'] }
      });
      results['deviceCommands'] = commandsResult.deletedCount;

      // Clean up old energy measurements (if using MongoDB instead of InfluxDB)
      const EnergyMeasurement = this.getModel('EnergyMeasurement');
      const oneYearAgo = new Date(Date.now() - (365 * 24 * 60 * 60 * 1000));
      const measurementsResult = await EnergyMeasurement.deleteMany({
        timestamp: { $lt: oneYearAgo }
      });
      results['energyMeasurements'] = measurementsResult.deletedCount;

      logger.info('Old data cleanup completed', results);
      return results;
    } catch (error) {
      logger.error('Failed to cleanup old data', { error });
      throw new DatabaseError('Failed to cleanup old data', { originalError: error });
    }
  }
}

export default MongooseManager;