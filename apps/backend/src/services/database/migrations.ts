import mongoose from 'mongoose';
import { config } from '@/config/environment';
import logger from '@/config/logger';
import { DatabaseError } from '@/utils/errors';

/**
 * Database Migration System
 * 
 * Provides a structured way to evolve database schema and data
 * while maintaining backward compatibility and data integrity.
 */

export interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: mongoose.Connection) => Promise<void>;
  down: (db: mongoose.Connection) => Promise<void>;
}

/**
 * Migration Document Schema
 */
const MigrationSchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  executedAt: {
    type: Date,
    default: Date.now
  },
  executionTime: {
    type: Number, // milliseconds
    required: true
  },
  checksum: {
    type: String,
    required: true
  }
});

const MigrationModel = mongoose.model('Migration', MigrationSchema);

/**
 * Migration Manager
 */
export class MigrationManager {
  private migrations: Migration[] = [];
  private db: mongoose.Connection;

  constructor(db: mongoose.Connection) {
    this.db = db;
    this.registerMigrations();
  }

  /**
   * Register all available migrations
   */
  private registerMigrations(): void {
    // Migration 001: Initial schema setup
    this.migrations.push({
      version: 1,
      name: 'initial_schema',
      description: 'Create initial indexes and default data',
      up: async (db) => {
        // Create indexes for all collections
        await this.createInitialIndexes(db);
        
        // Create default user preferences for existing users
        await this.createDefaultUserPreferences(db);
        
        logger.info('Initial schema migration completed');
      },
      down: async (db) => {
        logger.warn('Downgrading initial schema - this will remove all indexes');
        // Remove custom indexes (keep _id indexes)
        const collections = await db.db.listCollections().toArray();
        for (const collection of collections) {
          try {
            await db.db.collection(collection.name).dropIndexes();
          } catch (error) {
            logger.warn(`Failed to drop indexes for ${collection.name}`, { error });
          }
        }
      }
    });

    // Migration 002: Add energy role to existing devices
    this.migrations.push({
      version: 2,
      name: 'add_energy_role_to_devices',
      description: 'Add energyRole field to existing devices based on type',
      up: async (db) => {
        const devices = db.collection('devices');
        
        // Update smart plugs to be consumers
        await devices.updateMany(
          { deviceType: 'smart_plug', energyRole: { $exists: false } },
          { $set: { energyRole: 'consumer' } }
        );
        
        // Update solar inverters to be producers
        await devices.updateMany(
          { deviceType: 'solar_inverter', energyRole: { $exists: false } },
          { $set: { energyRole: 'producer' } }
        );
        
        // Update battery packs to be storage
        await devices.updateMany(
          { deviceType: 'battery_pack', energyRole: { $exists: false } },
          { $set: { energyRole: 'storage' } }
        );
        
        // Update energy meters to be monitors
        await devices.updateMany(
          { deviceType: 'energy_meter', energyRole: { $exists: false } },
          { $set: { energyRole: 'monitor' } }
        );
        
        logger.info('Energy role migration completed');
      },
      down: async (db) => {
        const devices = db.collection('devices');
        await devices.updateMany({}, { $unset: { energyRole: 1 } });
        logger.info('Energy role migration rolled back');
      }
    });

    // Migration 003: Update user settings structure
    this.migrations.push({
      version: 3,
      name: 'update_user_settings_structure',
      description: 'Migrate user settings to new nested structure',
      up: async (db) => {
        const users = db.collection('users');
        
        // Get all users with old settings structure
        const usersWithOldSettings = await users.find({
          'settings.theme': { $exists: true }
        }).toArray();
        
        for (const user of usersWithOldSettings) {
          const newSettings = {
            ui: {
              theme: user.settings.theme || 'auto',
              language: user.settings.language || 'en',
              timezone: user.settings.timezone || 'UTC'
            },
            notifications: {
              email: { enabled: user.settings.emailNotifications !== false },
              push: { enabled: user.settings.pushNotifications !== false },
              deviceAlerts: true,
              energyAlerts: true,
              systemNotifications: true
            },
            energy: {
              tariffStructure: 'fixed',
              currency: 'EUR',
              optimizationMode: 'cost'
            },
            devices: {
              defaultSettings: {
                autoDiscovery: true,
                energyMonitoring: true
              },
              display: {
                showOfflineDevices: true,
                sortBy: 'name',
                viewMode: 'grid'
              }
            },
            privacy: {
              dataRetention: {
                energyData: 365,
                commandHistory: 90
              },
              sharing: {
                anonymousAnalytics: true
              }
            }
          };
          
          await users.updateOne(
            { _id: user._id },
            { $set: { settings: newSettings } }
          );
        }
        
        logger.info('User settings structure migration completed');
      },
      down: async (db) => {
        // This migration is not easily reversible
        logger.warn('User settings structure migration cannot be easily reversed');
      }
    });

    // Migration 004: Add device command analytics fields
    this.migrations.push({
      version: 4,
      name: 'add_device_command_analytics',
      description: 'Add analytics fields to device commands',
      up: async (db) => {
        const commands = db.collection('devicecommands');
        
        // Add default values for new analytics fields
        await commands.updateMany(
          { priority: { $exists: false } },
          { $set: { priority: 'normal' } }
        );
        
        await commands.updateMany(
          { tags: { $exists: false } },
          { $set: { tags: [] } }
        );
        
        await commands.updateMany(
          { source: { $exists: false } },
          { $set: { source: 'user' } }
        );
        
        logger.info('Device command analytics migration completed');
      },
      down: async (db) => {
        const commands = db.collection('devicecommands');
        await commands.updateMany(
          {},
          { 
            $unset: { 
              priority: 1, 
              tags: 1, 
              source: 1,
              sourceDetails: 1,
              correlationId: 1,
              batchId: 1
            } 
          }
        );
        logger.info('Device command analytics migration rolled back');
      }
    });

    // Migration 005: Create user preferences for existing users
    this.migrations.push({
      version: 5,
      name: 'create_user_preferences',
      description: 'Create user preferences documents for existing users',
      up: async (db) => {
        const users = db.collection('users');
        const preferences = db.collection('userpreferences');
        
        // Get all users without preferences
        const usersWithoutPrefs = await users.find({}).toArray();
        const existingPrefs = await preferences.find({}).toArray();
        const existingUserIds = new Set(existingPrefs.map(p => p.userId));
        
        for (const user of usersWithoutPrefs) {
          if (!existingUserIds.has(user._id.toString())) {
            const defaultPreferences = {
              userId: user._id.toString(),
              dashboards: [{
                id: 'default',
                name: 'Main Dashboard',
                isDefault: true,
                widgets: [],
                layout: 'grid',
                columns: 12,
                gridSize: 8,
                theme: 'auto'
              }],
              activeDashboardId: 'default',
              ui: {
                theme: 'auto',
                language: 'en',
                timezone: 'UTC',
                dateFormat: 'YYYY-MM-DD',
                timeFormat: '24h',
                temperatureUnit: 'celsius',
                energyUnit: 'kWh',
                powerUnit: 'W',
                currencySymbol: '€'
              },
              version: 1,
              lastModified: {},
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            await preferences.insertOne(defaultPreferences);
          }
        }
        
        logger.info('User preferences creation migration completed');
      },
      down: async (db) => {
        // Remove all user preferences created by this migration
        await db.collection('userpreferences').deleteMany({});
        logger.info('User preferences creation migration rolled back');
      }
    });

    logger.info(`Registered ${this.migrations.length} migrations`);
  }

  /**
   * Run pending migrations
   */
  async migrate(): Promise<void> {
    try {
      logger.info('Starting database migration...');
      
      // Get current migration version
      const currentVersion = await this.getCurrentVersion();
      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations`);
      
      // Execute migrations in order
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }
      
      logger.info('Database migration completed successfully');
    } catch (error) {
      logger.error('Database migration failed', { error });
      throw new DatabaseError('Migration failed', { originalError: error });
    }
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: number): Promise<void> {
    try {
      const currentVersion = await this.getCurrentVersion();
      
      if (targetVersion >= currentVersion) {
        throw new DatabaseError('Target version must be lower than current version');
      }
      
      // Get migrations to rollback (in reverse order)
      const migrationsToRollback = this.migrations
        .filter(m => m.version > targetVersion && m.version <= currentVersion)
        .sort((a, b) => b.version - a.version);
      
      logger.info(`Rolling back ${migrationsToRollback.length} migrations to version ${targetVersion}`);
      
      for (const migration of migrationsToRollback) {
        await this.rollbackMigration(migration);
      }
      
      logger.info('Database rollback completed successfully');
    } catch (error) {
      logger.error('Database rollback failed', { error });
      throw new DatabaseError('Rollback failed', { originalError: error });
    }
  }

  /**
   * Get current migration version
   */
  async getCurrentVersion(): Promise<number> {
    try {
      const lastMigration = await MigrationModel
        .findOne({}, {}, { sort: { version: -1 } });
      
      return lastMigration ? lastMigration.version : 0;
    } catch (error) {
      // Migration collection doesn't exist yet
      return 0;
    }
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    currentVersion: number;
    latestVersion: number;
    pendingMigrations: number;
    executedMigrations: any[];
  }> {
    const currentVersion = await this.getCurrentVersion();
    const latestVersion = Math.max(...this.migrations.map(m => m.version), 0);
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion).length;
    
    const executedMigrations = await MigrationModel
      .find({})
      .sort({ version: 1 })
      .lean();
    
    return {
      currentVersion,
      latestVersion,
      pendingMigrations,
      executedMigrations
    };
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info(`Executing migration ${migration.version}: ${migration.name}`);
      
      // Execute the migration
      await migration.up(this.db);
      
      const executionTime = Date.now() - startTime;
      const checksum = this.calculateChecksum(migration);
      
      // Record the migration
      await MigrationModel.create({
        version: migration.version,
        name: migration.name,
        description: migration.description,
        executedAt: new Date(),
        executionTime,
        checksum
      });
      
      logger.info(`Migration ${migration.version} completed in ${executionTime}ms`);
    } catch (error) {
      logger.error(`Migration ${migration.version} failed`, { error });
      throw error;
    }
  }

  /**
   * Rollback a single migration
   */
  private async rollbackMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);
      
      // Execute the rollback
      await migration.down(this.db);
      
      // Remove the migration record
      await MigrationModel.deleteOne({ version: migration.version });
      
      const executionTime = Date.now() - startTime;
      logger.info(`Migration ${migration.version} rolled back in ${executionTime}ms`);
    } catch (error) {
      logger.error(`Migration ${migration.version} rollback failed`, { error });
      throw error;
    }
  }

  /**
   * Calculate checksum for migration integrity
   */
  private calculateChecksum(migration: Migration): string {
    const crypto = require('crypto');
    const content = `${migration.version}-${migration.name}-${migration.description}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Helper: Create initial indexes
   */
  private async createInitialIndexes(db: mongoose.Connection): Promise<void> {
    const collections = [
      {
        name: 'users',
        indexes: [
          { key: { email: 1 }, options: { unique: true } },
          { key: { 'auth.provider': 1, 'auth.providerId': 1 } },
          { key: { createdAt: 1 } },
          { key: { lastLoginAt: 1 } }
        ]
      },
      {
        name: 'devices',
        indexes: [
          { key: { userId: 1 } },
          { key: { deviceId: 1, userId: 1 }, options: { unique: true } },
          { key: { deviceType: 1 } },
          { key: { protocol: 1 } },
          { key: { isOnline: 1 } },
          { key: { lastSeenAt: 1 } }
        ]
      },
      {
        name: 'devicecommands',
        indexes: [
          { key: { deviceId: 1 } },
          { key: { userId: 1 } },
          { key: { status: 1 } },
          { key: { createdAt: 1 } },
          { key: { executedAt: 1 } }
        ]
      },
      {
        name: 'sessions',
        indexes: [
          { key: { sessionToken: 1 }, options: { unique: true } },
          { key: { userId: 1 } },
          { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }
        ]
      }
    ];

    for (const collection of collections) {
      for (const index of collection.indexes) {
        try {
          await db.collection(collection.name).createIndex(index.key, index.options || {});
          logger.debug(`Created index for ${collection.name}`, { index: index.key });
        } catch (error) {
          logger.warn(`Failed to create index for ${collection.name}`, { index: index.key, error });
        }
      }
    }
  }

  /**
   * Helper: Create default user preferences
   */
  private async createDefaultUserPreferences(db: mongoose.Connection): Promise<void> {
    // This will be handled by migration 005
    logger.debug('Default user preferences creation deferred to migration 005');
  }
}

/**
 * Migration CLI commands
 */
export async function runMigrationCommand(command: string, args: string[] = []): Promise<void> {
  if (!mongoose.connection.readyState) {
    throw new DatabaseError('Database not connected');
  }

  const manager = new MigrationManager(mongoose.connection);

  switch (command) {
    case 'migrate':
      await manager.migrate();
      break;
      
    case 'rollback':
      const targetVersion = parseInt(args[0]);
      if (isNaN(targetVersion)) {
        throw new Error('Rollback requires a target version number');
      }
      await manager.rollback(targetVersion);
      break;
      
    case 'status':
      const status = await manager.getStatus();
      console.log('Migration Status:');
      console.log(`Current Version: ${status.currentVersion}`);
      console.log(`Latest Version: ${status.latestVersion}`);
      console.log(`Pending Migrations: ${status.pendingMigrations}`);
      console.log('\nExecuted Migrations:');
      status.executedMigrations.forEach(m => {
        console.log(`  ${m.version}: ${m.name} (${m.executedAt})`);
      });
      break;
      
    default:
      throw new Error(`Unknown migration command: ${command}`);
  }
}

export default MigrationManager;