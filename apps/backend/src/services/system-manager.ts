import { EventEmitter } from 'events';
import { DatabaseManager } from '@/services/database';
import { CacheManager } from '@/services/cache';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { WebSocketManager } from '@/services/websocket';
import { WebSocketIntegrationService } from '@/services/websocket-integration';
import { DeviceIntegrationService } from '@/services/device-integration';
import { DeviceHistoryService } from '@/services/device-history';
import { DeviceService } from '@/services/database/DeviceService';
import { UserService } from '@/services/database/UserService';
import { AuthMiddleware } from '@/middleware/auth';
import { createError } from '@/utils/errors';
import logger, { createModuleLogger } from '@/config/logger';

/**
 * System Manager
 * 
 * Central coordinator for all system services in the Maestro energy management system.
 * Handles initialization, dependency injection, graceful shutdown, and health monitoring.
 * 
 * Features:
 * - Service lifecycle management
 * - Dependency resolution
 * - Health monitoring
 * - Graceful shutdown
 * - Error recovery
 * - System diagnostics
 */

export interface SystemServices {
  database: DatabaseManager;
  cache: CacheManager;
  protocolManager: ProtocolAdapterManager;
  webSocket?: WebSocketManager;
  webSocketIntegration?: WebSocketIntegrationService;
  deviceIntegration: DeviceIntegrationService;
  deviceHistory: DeviceHistoryService;
  deviceService: DeviceService;
  userService: UserService;
  auth: AuthMiddleware;
}

export interface SystemConfig {
  enableWebSocket?: boolean;
  enableProtocolAdapters?: boolean;
  enableDeviceHistory?: boolean;
  maxInitializationTime?: number; // milliseconds
  healthCheckInterval?: number; // milliseconds
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: Date;
    details?: any;
    error?: string;
  }>;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  timestamp: Date;
}

export class SystemManager extends EventEmitter {
  private moduleLogger = createModuleLogger('SystemManager');
  private services: Partial<SystemServices> = {};
  private isInitialized = false;
  private isShuttingDown = false;
  private startTime = Date.now();
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck?: SystemHealth;

  constructor(private config: SystemConfig = {}) {
    super();
    this.moduleLogger.info('System manager created', { config });
    this.setupProcessHandlers();
  }

  /**
   * Initialize all system services in the correct order
   */
  async initialize(): Promise<SystemServices> {
    const maxTime = this.config.maxInitializationTime || 60000; // 1 minute default
    const startTime = Date.now();

    try {
      this.moduleLogger.info('Starting system initialization...');

      // Wrap initialization with timeout
      const initPromise = this.performInitialization();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('System initialization timeout')), maxTime)
      );

      await Promise.race([initPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      this.isInitialized = true;

      this.moduleLogger.info('System initialization completed', {
        duration,
        services: Object.keys(this.services)
      });

      // Start health monitoring
      this.startHealthMonitoring();

      this.emit('initialized', this.services);
      return this.services as SystemServices;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.moduleLogger.error('System initialization failed', { error, duration });
      
      // Cleanup any partially initialized services
      await this.cleanup();
      
      throw createError.internal('System initialization failed', { originalError: error });
    }
  }

  /**
   * Gracefully shutdown all services
   */
  async shutdown(reason: string = 'Manual shutdown'): Promise<void> {
    if (this.isShuttingDown) {
      this.moduleLogger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.moduleLogger.info('Starting system shutdown', { reason });

    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Shutdown services in reverse order
      await this.performShutdown();

      this.moduleLogger.info('System shutdown completed');
      this.emit('shutdown', reason);

    } catch (error) {
      this.moduleLogger.error('Error during system shutdown', { error });
      throw error;
    }
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<SystemHealth> {
    if (this.lastHealthCheck && Date.now() - this.lastHealthCheck.timestamp.getTime() < 30000) {
      return this.lastHealthCheck;
    }

    const health: SystemHealth = {
      status: 'healthy',
      services: {},
      uptime: Date.now() - this.startTime,
      memory: process.memoryUsage(),
      timestamp: new Date()
    };

    // Check each service
    const serviceChecks = [
      { name: 'database', service: this.services.database },
      { name: 'cache', service: this.services.cache },
      { name: 'protocolManager', service: this.services.protocolManager },
      { name: 'webSocket', service: this.services.webSocket },
      { name: 'deviceIntegration', service: this.services.deviceIntegration },
      { name: 'deviceHistory', service: this.services.deviceHistory }
    ];

    for (const { name, service } of serviceChecks) {
      if (!service) continue;

      try {
        let serviceHealth = { status: 'healthy' as const, details: undefined };

        // Call service-specific health check if available
        if (typeof (service as any).healthCheck === 'function') {
          const result = await (service as any).healthCheck();
          serviceHealth = {
            status: result.status === 'healthy' ? 'healthy' : 'degraded',
            details: result.details
          };
        }

        health.services[name] = {
          ...serviceHealth,
          lastCheck: new Date()
        };

      } catch (error) {
        health.services[name] = {
          status: 'unhealthy',
          lastCheck: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        health.status = 'degraded';
      }
    }

    // Overall health assessment
    const unhealthyServices = Object.values(health.services).filter(s => s.status === 'unhealthy');
    const degradedServices = Object.values(health.services).filter(s => s.status === 'degraded');

    if (unhealthyServices.length > 0) {
      health.status = 'unhealthy';
    } else if (degradedServices.length > 0) {
      health.status = 'degraded';
    }

    this.lastHealthCheck = health;
    return health;
  }

  /**
   * Get system services (for dependency injection)
   */
  getServices(): Partial<SystemServices> {
    return { ...this.services };
  }

  /**
   * Check if system is ready
   */
  isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  /**
   * Get system statistics
   */
  getSystemStats(): {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    initialized: boolean;
    services: string[];
    version: string;
  } {
    return {
      uptime: Date.now() - this.startTime,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      initialized: this.isInitialized,
      services: Object.keys(this.services),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  // Private methods

  private async performInitialization(): Promise<void> {
    try {
      // Step 1: Initialize database
      this.moduleLogger.info('Initializing database...');
      this.services.database = new DatabaseManager();
      await this.services.database.connect();

      // Step 2: Initialize cache
      this.moduleLogger.info('Initializing cache...');
      this.services.cache = new CacheManager();
      await this.services.cache.initialize();

      // Step 3: Initialize core services
      this.moduleLogger.info('Initializing core services...');
      this.services.deviceService = new DeviceService(this.services.database.getDevicesCollection());
      this.services.userService = new UserService(this.services.database.getUsersCollection());
      this.services.auth = new AuthMiddleware();

      // Step 4: Initialize device history service
      if (this.config.enableDeviceHistory !== false) {
        this.moduleLogger.info('Initializing device history service...');
        this.services.deviceHistory = new DeviceHistoryService(
          this.services.database.getDeviceCommandsCollection(),
          this.services.database.getCollection('device_status_logs'),
          this.services.database.getCollection('device_performance_metrics')
        );
      }

      // Step 5: Initialize protocol adapters
      if (this.config.enableProtocolAdapters !== false) {
        this.moduleLogger.info('Initializing protocol adapters...');
        this.services.protocolManager = new ProtocolAdapterManager();
        await this.services.protocolManager.initialize();
      }

      // Step 6: Initialize WebSocket (optional)
      if (this.config.enableWebSocket !== false && this.services.protocolManager) {
        this.moduleLogger.info('Initializing WebSocket services...');
        // WebSocket initialization would happen at the Express app level
        // This is a placeholder for the service reference
      }

      // Step 7: Initialize device integration service
      if (this.services.protocolManager && this.services.cache) {
        this.moduleLogger.info('Initializing device integration service...');
        this.services.deviceIntegration = new DeviceIntegrationService(
          this.services.deviceService,
          this.services.protocolManager,
          this.services.webSocket!, // Will be set later
          this.services.cache
        );
        // Note: DeviceIntegrationService.initialize() will be called after WebSocket setup
      }

      this.moduleLogger.info('Core services initialization completed');

    } catch (error) {
      this.moduleLogger.error('Failed to initialize services', { error });
      throw error;
    }
  }

  private async performShutdown(): Promise<void> {
    const shutdownServices = [
      { name: 'deviceIntegration', service: this.services.deviceIntegration },
      { name: 'webSocketIntegration', service: this.services.webSocketIntegration },
      { name: 'webSocket', service: this.services.webSocket },
      { name: 'deviceHistory', service: this.services.deviceHistory },
      { name: 'protocolManager', service: this.services.protocolManager },
      { name: 'cache', service: this.services.cache },
      { name: 'database', service: this.services.database }
    ];

    for (const { name, service } of shutdownServices) {
      if (!service) continue;

      try {
        this.moduleLogger.info(`Shutting down ${name}...`);
        
        if (typeof (service as any).shutdown === 'function') {
          await (service as any).shutdown();
        } else if (typeof (service as any).disconnect === 'function') {
          await (service as any).disconnect();
        }
        
        this.moduleLogger.info(`${name} shut down successfully`);
        
      } catch (error) {
        this.moduleLogger.error(`Failed to shutdown ${name}`, { error });
      }
    }

    // Clear services
    this.services = {};
  }

  private async cleanup(): Promise<void> {
    this.moduleLogger.info('Cleaning up partially initialized services...');
    await this.performShutdown();
  }

  private setupProcessHandlers(): void {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', async () => {
      this.moduleLogger.info('Received SIGTERM, initiating graceful shutdown');
      try {
        await this.shutdown('SIGTERM');
        process.exit(0);
      } catch (error) {
        this.moduleLogger.error('Error during SIGTERM shutdown', { error });
        process.exit(1);
      }
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      this.moduleLogger.info('Received SIGINT, initiating graceful shutdown');
      try {
        await this.shutdown('SIGINT');
        process.exit(0);
      } catch (error) {
        this.moduleLogger.error('Error during SIGINT shutdown', { error });
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.moduleLogger.error('Uncaught exception', { error });
      this.shutdown('Uncaught exception').finally(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.moduleLogger.error('Unhandled promise rejection', { reason, promise });
    });
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckInterval || 60000; // 1 minute default
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        
        if (health.status !== 'healthy') {
          this.moduleLogger.warn('System health check detected issues', {
            status: health.status,
            unhealthyServices: Object.entries(health.services)
              .filter(([_, status]) => status.status !== 'healthy')
              .map(([name, status]) => ({ name, status: status.status, error: status.error }))
          });
          
          this.emit('healthIssue', health);
        }
        
      } catch (error) {
        this.moduleLogger.error('Health check failed', { error });
      }
    }, interval);

    this.moduleLogger.info('Health monitoring started', { interval });
  }

  /**
   * Complete WebSocket setup (called from Express app)
   */
  async completeWebSocketSetup(wsManager: WebSocketManager): Promise<void> {
    this.services.webSocket = wsManager;

    if (this.services.deviceIntegration) {
      // Update device integration with WebSocket manager
      (this.services.deviceIntegration as any).wsManager = wsManager;
      await this.services.deviceIntegration.initialize();

      // Initialize WebSocket integration
      this.services.webSocketIntegration = new WebSocketIntegrationService(
        wsManager,
        this.services.deviceIntegration,
        this.services.deviceService!
      );
      this.services.webSocketIntegration.initialize();

      this.moduleLogger.info('WebSocket setup completed');
    }
  }
}

export default SystemManager;