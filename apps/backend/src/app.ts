import express, { Application } from 'express';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config, validateConfig } from '@/config/environment';
import logger, { setupErrorLogging, logStartup } from '@/config/logger';
import { setupAllMiddleware } from '@/middleware';
import { setupRoutes } from '@/routes';
import { DatabaseManager } from '@/services/database';
import { CacheManager } from '@/services/cache';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { WebSocketManager } from '@/services/websocket';
import { HealthCheckService } from '@/services/health-check';
import { createError } from '@/utils/errors';

/**
 * Maestro Backend Application
 * 
 * Main Express.js application with full middleware stack, error handling,
 * and integration with IoT protocol adapters.
 */
export class MaestroApp {
  private app: Application;
  private server?: Server;
  private socketIO?: SocketIOServer;
  private databaseManager: DatabaseManager;
  private cacheManager: CacheManager;
  private protocolAdapterManager: ProtocolAdapterManager;
  private webSocketManager?: WebSocketManager;
  private healthCheckService: HealthCheckService;
  private isShuttingDown = false;

  constructor() {
    // Validate configuration before starting
    this.validateEnvironment();
    
    // Initialize Express app
    this.app = express();
    
    // Initialize services
    this.databaseManager = new DatabaseManager();
    this.cacheManager = new CacheManager();
    this.protocolAdapterManager = new ProtocolAdapterManager();
    this.healthCheckService = new HealthCheckService();
    
    // Setup error handling for uncaught exceptions
    setupErrorLogging();
    
    logger.info('Maestro application initialized');
  }

  /**
   * Initialize the application
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('Starting Maestro application initialization...');

      // Initialize core services
      await this.initializeServices();
      
      // Setup Express middleware
      this.setupMiddleware();
      
      // Setup API routes
      this.setupRoutes();
      
      // Start the HTTP server
      await this.startServer();
      
      // Setup WebSocket if enabled
      if (config.websocket.enabled) {
        await this.setupWebSocket();
      }
      
      // Start health checks
      this.healthCheckService.start();
      
      logger.info('Maestro application initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Maestro application', { error });
      throw error;
    }
  }

  /**
   * Gracefully shutdown the application
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    try {
      // Stop accepting new connections
      if (this.server) {
        this.server.close();
      }

      // Close WebSocket connections
      if (this.socketIO) {
        this.socketIO.close();
      }

      // Stop health checks
      this.healthCheckService.stop();

      // Shutdown protocol adapters
      await this.protocolAdapterManager.shutdown();

      // Close database connections
      await this.databaseManager.disconnect();

      // Close cache connections
      await this.cacheManager.disconnect();

      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  /**
   * Get the Express application instance
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Get the HTTP server instance
   */
  public getServer(): Server | undefined {
    return this.server;
  }

  /**
   * Get application health status
   */
  public async getHealthStatus(): Promise<any> {
    return this.healthCheckService.getStatus();
  }

  /**
   * Validate environment configuration
   */
  private validateEnvironment(): void {
    try {
      validateConfig();
      logger.info('Environment configuration validated successfully');
    } catch (error) {
      logger.error('Environment configuration validation failed', { error });
      throw createError.internal('Invalid environment configuration', { error });
    }
  }

  /**
   * Initialize core services
   */
  private async initializeServices(): Promise<void> {
    logger.info('Initializing core services...');

    try {
      // Initialize database connection
      await this.databaseManager.connect();
      logger.info('Database connection established');

      // Initialize cache connection
      await this.cacheManager.connect();
      logger.info('Cache connection established');

      // Initialize protocol adapters
      await this.protocolAdapterManager.initialize();
      logger.info('Protocol adapters initialized');

      // Register health checks
      this.registerHealthChecks();

      logger.info('Core services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize core services', { error });
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    logger.info('Setting up Express middleware...');
    
    // Apply all middleware
    setupAllMiddleware(this.app);
    
    // Add service instances to request context
    this.app.use((req, res, next) => {
      req.services = {
        database: this.databaseManager,
        cache: this.cacheManager,
        protocolAdapters: this.protocolAdapterManager,
        healthCheck: this.healthCheckService,
      };
      next();
    });
    
    logger.info('Express middleware setup completed');
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    logger.info('Setting up API routes...');
    
    setupRoutes(this.app);
    
    logger.info('API routes setup completed');
  }

  /**
   * Start the HTTP server
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(config.port, config.host, () => {
          logStartup();
          logger.info(`Server started on ${config.host}:${config.port}`);
          resolve();
        });

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${config.port} is already in use`);
            reject(createError.internal(`Port ${config.port} is already in use`));
          } else {
            logger.error('Server error', { error });
            reject(error);
          }
        });

        // Handle server shutdown gracefully
        this.server.on('close', () => {
          logger.info('HTTP server closed');
        });

      } catch (error) {
        logger.error('Failed to start server', { error });
        reject(error);
      }
    });
  }

  /**
   * Setup WebSocket server
   */
  private async setupWebSocket(): Promise<void> {
    if (!this.server) {
      throw createError.internal('HTTP server must be started before WebSocket');
    }

    logger.info('Setting up WebSocket server...');

    this.socketIO = new SocketIOServer(this.server, {
      cors: {
        origin: config.cors.origin,
        credentials: config.cors.credentials,
      },
      pingTimeout: config.websocket.pingTimeout,
      pingInterval: config.websocket.pingInterval,
    });

    this.webSocketManager = new WebSocketManager(this.socketIO);
    await this.webSocketManager.initialize();

    // Integrate WebSocket with protocol adapters
    this.protocolAdapterManager.on('deviceUpdate', (update) => {
      this.webSocketManager?.broadcastDeviceUpdate(update);
    });

    logger.info('WebSocket server setup completed');
  }

  /**
   * Register health checks for core services
   */
  private registerHealthChecks(): void {
    // Database health check
    this.healthCheckService.registerCheck('database', async () => {
      const isConnected = this.databaseManager.isConnected();
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        details: {
          connected: isConnected,
          connectionString: config.mongodb.uri.replace(/\/\/.*@/, '//***:***@'),
        },
      };
    });

    // Cache health check
    this.healthCheckService.registerCheck('cache', async () => {
      const isConnected = this.cacheManager.isConnected();
      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        details: {
          connected: isConnected,
          url: config.redis.url.replace(/\/\/.*@/, '//***:***@'),
        },
      };
    });

    // Protocol adapters health check
    this.healthCheckService.registerCheck('protocol-adapters', async () => {
      const adapters = this.protocolAdapterManager.getAdapterStatus();
      const healthyCount = adapters.filter(a => a.connected).length;
      
      return {
        status: healthyCount > 0 ? 'healthy' : 'unhealthy',
        details: {
          total: adapters.length,
          healthy: healthyCount,
          adapters: adapters.map(a => ({
            protocol: a.protocol,
            connected: a.connected,
            lastError: a.lastError,
          })),
        },
      };
    });

    // Memory health check
    this.healthCheckService.registerCheck('memory', async () => {
      const usage = process.memoryUsage();
      const totalMemory = usage.heapTotal;
      const usedMemory = usage.heapUsed;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      return {
        status: memoryUsagePercent < 90 ? 'healthy' : 'warning',
        details: {
          heapUsed: Math.round(usedMemory / 1024 / 1024), // MB
          heapTotal: Math.round(totalMemory / 1024 / 1024), // MB
          usagePercent: Math.round(memoryUsagePercent),
          external: Math.round(usage.external / 1024 / 1024), // MB
        },
      };
    });

    // Authentication service health check
    this.healthCheckService.registerCheck('authentication', async () => {
      try {
        if (!this.authService) {
          return {
            status: 'unhealthy',
            details: { error: 'Authentication service not initialized' }
          };
        }

        // Test session cleanup (this also validates database connectivity)
        await this.authService.cleanupExpiredSessions();
        
        return {
          status: 'healthy',
          details: {
            jwtConfigured: !!config.jwt.secret,
            sessionCleanupWorking: true
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }
        };
      }
    });

    // Tuya OAuth service health check
    this.healthCheckService.registerCheck('tuya-oauth', async () => {
      try {
        if (!this.tuyaOAuthService) {
          return {
            status: 'unhealthy',
            details: { error: 'Tuya OAuth service not initialized' }
          };
        }

        return {
          status: 'healthy',
          details: {
            clientConfigured: !!config.tuya.clientId,
            baseUrl: config.tuya.baseUrl,
            region: config.tuya.region,
            redirectUri: config.tuya.redirectUri
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }
        };
      }
    });
  }
}

// Extend Express Request interface for service access
declare global {
  namespace Express {
    interface Request {
      services?: {
        database: DatabaseManager;
        cache: CacheManager;
        auth?: AuthService;
        tuyaOAuth?: TuyaOAuthService;
        protocolAdapters: ProtocolAdapterManager;
        healthCheck: HealthCheckService;
      };
    }
  }
}

export default MaestroApp;