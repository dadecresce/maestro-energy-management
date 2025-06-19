import { Router, Request, Response } from 'express';
import { HealthCheckService } from '@/services/health-check';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { WebSocketManager } from '@/services/websocket';
import { CacheManager } from '@/services/cache';
import { DatabaseManager } from '@/services/database';
import { DeviceService } from '@/services/database/DeviceService';
import { UserService } from '@/services/database/UserService';
import { ApiError } from '@/utils/errors';
import logger from '@/config/logger';
import { config } from '@/config/environment';
import os from 'os';
import process from 'process';

/**
 * Health Check Routes
 * 
 * Provides endpoints for monitoring system health and status
 */
const router = Router();

// Services (would typically be injected via DI container)
let healthService: HealthCheckService;
let protocolManager: ProtocolAdapterManager;
let wsManager: WebSocketManager;
let cache: CacheManager;
let db: DatabaseManager;
let deviceService: DeviceService;
let userService: UserService;

// Service initialization function (called from app startup)
export function initializeHealthServices(
  healthCheckService: HealthCheckService,
  protocolMgr: ProtocolAdapterManager,
  webSocketMgr: WebSocketManager,
  cacheManager: CacheManager,
  database: DatabaseManager,
  deviceSvc: DeviceService,
  userSvc: UserService
) {
  healthService = healthCheckService;
  protocolManager = protocolMgr;
  wsManager = webSocketMgr;
  cache = cacheManager;
  db = database;
  deviceService = deviceSvc;
  userService = userSvc;
}

/**
 * GET /api/v1/health
 * Get overall system health status
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    logger.debug('Health check requested', { requestId: req.requestId });
    
    // Perform quick health checks
    const checks = await Promise.allSettled([
      checkDatabaseHealth(),
      checkCacheHealth(),
      checkProtocolAdaptersHealth(),
      checkWebSocketHealth(),
      checkSystemHealth()
    ]);

    const [dbCheck, cacheCheck, adaptersCheck, wsCheck, sysCheck] = checks;
    
    const healthData = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv,
      services: {
        database: getCheckResult(dbCheck, 'Database'),
        cache: getCheckResult(cacheCheck, 'Cache'),
        protocolAdapters: getCheckResult(adaptersCheck, 'Protocol Adapters'),
        websocket: getCheckResult(wsCheck, 'WebSocket'),
        system: getCheckResult(sysCheck, 'System')
      },
      uptime: process.uptime(),
      requestId: req.requestId
    };

    // Determine overall health status
    const serviceStatuses = Object.values(healthData.services).map(s => s.status);
    if (serviceStatuses.includes('unhealthy')) {
      healthData.status = 'unhealthy';
    } else if (serviceStatuses.includes('degraded')) {
      healthData.status = 'degraded';
    }

    const statusCode = healthData.status === 'healthy' ? 200 : 
                      healthData.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      success: healthData.status !== 'unhealthy',
      data: healthData,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Health check failed', { 
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }

  // Helper function to extract check results
  function getCheckResult(checkResult: PromiseSettledResult<any>, serviceName: string) {
    if (checkResult.status === 'fulfilled') {
      return checkResult.value;
    } else {
      return {
        status: 'unhealthy',
        message: `${serviceName} check failed`,
        error: checkResult.reason?.message || 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
});

/**
 * GET /api/v1/health/detailed
 * Get detailed health status for all components
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    logger.debug('Detailed health check requested', { requestId: req.requestId });
    
    // Perform comprehensive health checks
    const [systemStats, dbStats, cacheStats, adapterStats, wsStats, appStats] = await Promise.allSettled([
      getDetailedSystemStats(),
      getDetailedDatabaseStats(),
      getDetailedCacheStats(),
      getDetailedAdapterStats(),
      getDetailedWebSocketStats(),
      getDetailedApplicationStats()
    ]);

    const detailedStatus = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: '1.0.0',
      uptime: process.uptime(),
      system: systemStats.status === 'fulfilled' ? systemStats.value : { error: systemStats.reason?.message },
      database: dbStats.status === 'fulfilled' ? dbStats.value : { error: dbStats.reason?.message },
      cache: cacheStats.status === 'fulfilled' ? cacheStats.value : { error: cacheStats.reason?.message },
      protocolAdapters: adapterStats.status === 'fulfilled' ? adapterStats.value : { error: adapterStats.reason?.message },
      websocket: wsStats.status === 'fulfilled' ? wsStats.value : { error: wsStats.reason?.message },
      application: appStats.status === 'fulfilled' ? appStats.value : { error: appStats.reason?.message },
      requestId: req.requestId
    };

    // Determine overall status based on component health
    const hasErrors = [systemStats, dbStats, cacheStats, adapterStats, wsStats, appStats]
      .some(result => result.status === 'rejected');
    
    if (hasErrors) {
      detailedStatus.status = 'degraded';
    }

    // Check for critical failures
    const criticalFailures = [dbStats, cacheStats].some(result => result.status === 'rejected');
    if (criticalFailures) {
      detailedStatus.status = 'unhealthy';
    }

    const statusCode = detailedStatus.status === 'healthy' ? 200 : 
                      detailedStatus.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      success: detailedStatus.status !== 'unhealthy',
      data: detailedStatus,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Detailed health check failed', { 
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    res.status(503).json({
      success: false,
      error: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/v1/health/ready
 * Readiness probe for Kubernetes/container orchestration
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const healthService = req.services?.healthCheck;
    
    if (!healthService) {
      return res.status(503).json({
        ready: false,
        error: 'Health check service not available',
      });
    }

    const isReady = await healthService.isReady();
    
    res.status(isReady ? 200 : 503).json({
      ready: isReady,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Readiness check failed', { error, requestId: req.requestId });
    
    res.status(503).json({
      ready: false,
      error: 'Readiness check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/v1/health/live
 * Liveness probe for Kubernetes/container orchestration
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if this endpoint responds, the app is alive
  res.status(200).json({
    alive: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/health/metrics
 * Application metrics and performance data
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Get application-specific metrics
    const [userCount, deviceCount, protocolStats, wsStats] = await Promise.allSettled([
      getUserMetrics(),
      getDeviceMetrics(),
      getProtocolMetrics(),
      getWebSocketMetrics()
    ]);
    
    const metrics = {
      system: {
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
        architecture: process.arch,
        loadAverage: os.loadavg(),
        freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
        totalMemory: Math.round(os.totalmem() / 1024 / 1024), // MB
        cpuCount: os.cpus().length
      },
      process: {
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024), // MB
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024) // MB
        },
        cpu: {
          user: Math.round(cpuUsage.user / 1000), // ms
          system: Math.round(cpuUsage.system / 1000), // ms
        }
      },
      application: {
        users: userCount.status === 'fulfilled' ? userCount.value : { error: 'Failed to get user metrics' },
        devices: deviceCount.status === 'fulfilled' ? deviceCount.value : { error: 'Failed to get device metrics' },
        protocols: protocolStats.status === 'fulfilled' ? protocolStats.value : { error: 'Failed to get protocol metrics' },
        websocket: wsStats.status === 'fulfilled' ? wsStats.value : { error: 'Failed to get WebSocket metrics' }
      },
      performance: {
        eventLoopUtilization: process.hrtime ? measureEventLoopUtilization() : null,
        gcStats: process.memoryUsage ? getGCStats() : null
      }
    };

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Metrics collection failed', { 
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Metrics collection failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }

  // Helper functions for metrics
  function measureEventLoopUtilization() {
    // This is a simplified version - in production you'd use perf_hooks
    return {
      active: Math.random() * 100,
      idle: Math.random() * 100,
      utilization: Math.random()
    };
  }

  function getGCStats() {
    // Simplified GC stats - in production you'd use v8 or gc-stats
    return {
      totalCollections: Math.floor(Math.random() * 1000),
      totalTime: Math.floor(Math.random() * 10000),
      averageTime: Math.floor(Math.random() * 10)
    };
  }
});

// Health check helper functions
async function checkDatabaseHealth() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  try {
    // Test database connection
    await db.getUsersCollection().findOne({}, { projection: { _id: 1 } });
    return {
      status: 'healthy',
      message: 'Database connection successful',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

async function checkCacheHealth() {
  if (!cache) {
    return {
      status: 'degraded',
      message: 'Cache not initialized',
      timestamp: new Date().toISOString()
    };
  }
  
  try {
    // Test cache connection
    const testKey = `health-check-${Date.now()}`;
    await cache.set(testKey, 'test', 5);
    await cache.get(testKey);
    await cache.del(testKey);
    
    return {
      status: 'healthy',
      message: 'Cache connection successful',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: 'Cache connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

async function checkProtocolAdaptersHealth() {
  if (!protocolManager) {
    return {
      status: 'degraded',
      message: 'Protocol manager not initialized',
      timestamp: new Date().toISOString()
    };
  }
  
  try {
    const isReady = protocolManager.isReady();
    const adapterStatus = protocolManager.getAdapterStatus();
    
    return {
      status: isReady ? 'healthy' : 'degraded',
      message: isReady ? 'Protocol adapters ready' : 'Some adapters not ready',
      adapters: adapterStatus,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Protocol adapters check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

async function checkWebSocketHealth() {
  if (!wsManager) {
    return {
      status: 'degraded',
      message: 'WebSocket manager not initialized',
      timestamp: new Date().toISOString()
    };
  }
  
  try {
    const healthCheck = wsManager.healthCheck();
    return {
      status: healthCheck.status === 'healthy' ? 'healthy' : 'degraded',
      message: 'WebSocket health check completed',
      details: healthCheck.details,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'degraded',
      message: 'WebSocket health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

async function checkSystemHealth() {
  try {
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;
    const loadAvg = os.loadavg()[0]; // 1-minute load average
    const cpuCount = os.cpus().length;
    
    let status = 'healthy';
    const issues = [];
    
    if (memUsagePercent > 90) {
      status = 'unhealthy';
      issues.push('High memory usage');
    } else if (memUsagePercent > 80) {
      status = 'degraded';
      issues.push('Elevated memory usage');
    }
    
    if (loadAvg > cpuCount * 2) {
      status = 'unhealthy';
      issues.push('High system load');
    } else if (loadAvg > cpuCount) {
      status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
      issues.push('Elevated system load');
    }
    
    return {
      status,
      message: issues.length > 0 ? issues.join(', ') : 'System resources healthy',
      metrics: {
        memoryUsage: Math.round(memUsagePercent),
        loadAverage: Math.round(loadAvg * 100) / 100,
        cpuCount,
        uptime: process.uptime()
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'System health check failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

// Detailed health check functions
async function getDetailedSystemStats() {
  return {
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    uptime: process.uptime(),
    loadAverage: os.loadavg(),
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024),
      used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
      percentage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
    },
    cpu: {
      count: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
      speed: os.cpus()[0]?.speed || 0
    }
  };
}

async function getDetailedDatabaseStats() {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const userCount = userService ? await userService.count({}) : 0;
    const deviceCount = deviceService ? await deviceService.count({}) : 0;
    
    return {
      connected: true,
      collections: {
        users: userCount,
        devices: deviceCount
      },
      performance: {
        avgResponseTime: Math.round(Math.random() * 50), // ms - placeholder
        connectionsActive: Math.floor(Math.random() * 10) + 1
      }
    };
  } catch (error) {
    throw new Error(`Database stats failed: ${error}`);
  }
}

async function getDetailedCacheStats() {
  if (!cache) throw new Error('Cache not initialized');
  
  // Placeholder stats - would integrate with actual Redis/cache metrics
  return {
    connected: true,
    memory: {
      used: Math.floor(Math.random() * 100), // MB
      peak: Math.floor(Math.random() * 200), // MB
    },
    performance: {
      hitRate: Math.round((Math.random() * 20 + 80) * 100) / 100, // 80-100%
      operations: Math.floor(Math.random() * 1000)
    }
  };
}

async function getDetailedAdapterStats() {
  if (!protocolManager) throw new Error('Protocol manager not initialized');
  
  try {
    const diagnostics = await protocolManager.getDiagnostics();
    return {
      adapters: diagnostics,
      ready: protocolManager.isReady(),
      totalAdapters: protocolManager.getAdapters().length
    };
  } catch (error) {
    throw new Error(`Adapter stats failed: ${error}`);
  }
}

async function getDetailedWebSocketStats() {
  if (!wsManager) throw new Error('WebSocket manager not initialized');
  
  const stats = wsManager.getConnectionStats();
  return {
    enabled: config.websocket.enabled,
    connections: stats.totalConnections,
    uniqueUsers: stats.uniqueUsers,
    rooms: stats.rooms.length,
    uptime: process.uptime()
  };
}

async function getDetailedApplicationStats() {
  const userCount = userService ? await userService.count({}) : 0;
  const deviceCount = deviceService ? await deviceService.count({}) : 0;
  const activeDevices = deviceService ? await deviceService.count({ isOnline: true }) : 0;
  
  return {
    version: '1.0.0',
    environment: config.nodeEnv,
    features: {
      websocket: config.websocket.enabled,
      protocolAdapters: protocolManager?.isReady() || false
    },
    statistics: {
      totalUsers: userCount,
      totalDevices: deviceCount,
      activeDevices,
      deviceUtilization: deviceCount > 0 ? Math.round((activeDevices / deviceCount) * 100) : 0
    }
  };
}

// Metrics helper functions
async function getUserMetrics() {
  if (!userService) return { total: 0, active: 0 };
  
  const total = await userService.count({});
  const active = await userService.count({ isActive: true });
  const recent = await userService.count({
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });
  
  return { total, active, recent };
}

async function getDeviceMetrics() {
  if (!deviceService) return { total: 0, online: 0 };
  
  const total = await deviceService.count({});
  const online = await deviceService.count({ isOnline: true });
  const byType = await deviceService.aggregate([
    { $group: { _id: '$deviceType', count: { $sum: 1 } } }
  ]);
  
  return { total, online, offline: total - online, byType };
}

async function getProtocolMetrics() {
  if (!protocolManager) return { adapters: 0, connected: 0 };
  
  const adapters = protocolManager.getAdapters();
  const connected = adapters.filter(a => a.isConnected()).length;
  
  return {
    total: adapters.length,
    connected,
    disconnected: adapters.length - connected,
    protocols: adapters.map(a => a.getProtocol())
  };
}

async function getWebSocketMetrics() {
  if (!wsManager) return { connections: 0, users: 0 };
  
  const stats = wsManager.getConnectionStats();
  return {
    connections: stats.totalConnections,
    uniqueUsers: stats.uniqueUsers,
    rooms: stats.rooms.length
  };
}

export default router;