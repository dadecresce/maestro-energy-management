/**
 * Database Services Index
 * 
 * Exports all database services for the Maestro Energy Management System
 */

export { BaseService } from './BaseService';
export { UserService } from './UserService';
export { DeviceService } from './DeviceService';
export { MongooseManager } from './MongooseManager';
export { MigrationManager, runMigrationCommand } from './migrations';

// Validation exports
export * from './validation';

// Re-export types
export type { PaginationResult } from './BaseService';
export type { Migration } from './migrations';

/**
 * Service Registry for dependency injection
 */
export const ServiceRegistry = {
  UserService,
  DeviceService,
  MongooseManager,
  MigrationManager
} as const;

/**
 * Initialize database with all components
 */
export async function initializeDatabase(): Promise<{
  mongooseManager: MongooseManager;
  userService: UserService;
  deviceService: DeviceService;
}> {
  const mongooseManager = new MongooseManager();
  
  // Connect to database
  await mongooseManager.connect();
  
  // Ensure indexes
  await mongooseManager.ensureIndexes();
  
  // Run pending migrations
  const migrationManager = new MigrationManager(mongooseManager.getConnection());
  await migrationManager.migrate();
  
  return {
    mongooseManager,
    userService: mongooseManager.userService,
    deviceService: mongooseManager.deviceService
  };
}

export default ServiceRegistry;