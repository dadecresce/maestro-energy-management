import { EventEmitter } from 'events';
import { config } from '@/config/environment';
import logger, { createModuleLogger } from '@/config/logger';

/**
 * Health Check Service
 * 
 * Provides comprehensive health monitoring for all system components
 * with configurable checks and real-time status updates
 */
export class HealthCheckService extends EventEmitter {
  private checks: Map<string, HealthCheck> = new Map();
  private isRunning = false;
  private checkInterval?: NodeJS.Timeout;
  private moduleLogger = createModuleLogger('HealthCheckService');
  private lastOverallStatus: OverallHealthStatus = 'healthy';

  constructor() {
    super();
    this.moduleLogger.info('Health check service initialized');
  }

  /**
   * Start health check monitoring
   */
  start(): void {
    if (this.isRunning) {
      this.moduleLogger.warn('Health check service already running');
      return;
    }

    this.moduleLogger.info('Starting health check service', {
      interval: config.healthCheck.interval,
      enabled: config.healthCheck.enabled,
    });

    if (!config.healthCheck.enabled) {
      this.moduleLogger.info('Health checks disabled by configuration');
      return;
    }

    this.isRunning = true;
    this.runHealthChecks(); // Run immediately
    
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, config.healthCheck.interval);

    this.moduleLogger.info('Health check service started');
  }

  /**
   * Stop health check monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.moduleLogger.info('Stopping health check service');

    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    this.moduleLogger.info('Health check service stopped');
  }

  /**
   * Register a new health check
   */
  registerCheck(name: string, checkFunction: HealthCheckFunction): void {
    const check: HealthCheck = {
      name,
      checkFunction,
      lastRun: null,
      lastStatus: null,
      lastError: null,
      runCount: 0,
      failureCount: 0,
    };

    this.checks.set(name, check);
    this.moduleLogger.debug('Health check registered', { name });
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): boolean {
    const removed = this.checks.delete(name);
    if (removed) {
      this.moduleLogger.debug('Health check unregistered', { name });
    }
    return removed;
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(): Promise<void> {
    if (this.checks.size === 0) {
      return;
    }

    this.moduleLogger.debug('Running health checks', { count: this.checks.size });

    const checkPromises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      return this.runSingleCheck(name, check);
    });

    await Promise.allSettled(checkPromises);

    // Determine overall status and emit events if changed
    const newOverallStatus = this.determineOverallStatus();
    if (newOverallStatus !== this.lastOverallStatus) {
      this.emit('statusChanged', newOverallStatus, this.lastOverallStatus);
      this.moduleLogger.info('Overall health status changed', {
        from: this.lastOverallStatus,
        to: newOverallStatus,
      });
      this.lastOverallStatus = newOverallStatus;
    }
  }

  /**
   * Run a single health check
   */
  private async runSingleCheck(name: string, check: HealthCheck): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        check.checkFunction(),
        new Promise<HealthCheckResult>((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 10000)
        ),
      ]);

      const duration = Date.now() - startTime;

      check.lastRun = new Date();
      check.lastStatus = result.status;
      check.lastError = null;
      check.runCount++;

      if (result.status !== 'healthy') {
        check.failureCount++;
      }

      this.moduleLogger.debug('Health check completed', {
        name,
        status: result.status,
        duration: `${duration}ms`,
      });

      this.emit('checkCompleted', name, result, duration);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      check.lastRun = new Date();
      check.lastStatus = 'unhealthy';
      check.lastError = errorMessage;
      check.runCount++;
      check.failureCount++;

      this.moduleLogger.error('Health check failed', {
        name,
        error: errorMessage,
        duration: `${duration}ms`,
      });

      this.emit('checkFailed', name, error, duration);
    }
  }

  /**
   * Get current health status
   */
  async getStatus(): Promise<HealthStatus> {
    const status = this.determineOverallStatus();
    const checks: Record<string, HealthCheckResult> = {};

    for (const [name, check] of this.checks) {
      checks[name] = {
        status: check.lastStatus || 'unknown',
        details: {
          lastRun: check.lastRun?.toISOString(),
          lastError: check.lastError,
          runCount: check.runCount,
          failureCount: check.failureCount,
          successRate: check.runCount > 0 ? 
            ((check.runCount - check.failureCount) / check.runCount * 100).toFixed(2) + '%' : 
            'N/A',
        },
      };
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      summary: {
        total: this.checks.size,
        healthy: Array.from(this.checks.values()).filter(c => c.lastStatus === 'healthy').length,
        warning: Array.from(this.checks.values()).filter(c => c.lastStatus === 'warning').length,
        unhealthy: Array.from(this.checks.values()).filter(c => c.lastStatus === 'unhealthy').length,
        unknown: Array.from(this.checks.values()).filter(c => !c.lastStatus).length,
      },
    };
  }

  /**
   * Get detailed status with additional information
   */
  async getDetailedStatus(): Promise<DetailedHealthStatus> {
    const basicStatus = await this.getStatus();

    return {
      ...basicStatus,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
          external: Math.round(process.memoryUsage().external / 1024 / 1024), // MB
        },
        cpu: process.cpuUsage(),
        pid: process.pid,
        uptime: process.uptime(),
      },
      environment: {
        nodeEnv: config.nodeEnv,
        version: process.env.npm_package_version || '1.0.0',
      },
      healthChecks: {
        enabled: config.healthCheck.enabled,
        interval: config.healthCheck.interval,
        running: this.isRunning,
        registered: this.checks.size,
      },
    };
  }

  /**
   * Check if system is ready (all critical checks are healthy)
   */
  async isReady(): Promise<boolean> {
    const status = await this.getStatus();
    
    // Consider system ready if no checks are unhealthy
    // Warnings are acceptable for readiness
    return status.summary.unhealthy === 0;
  }

  /**
   * Get specific check status
   */
  getCheckStatus(name: string): HealthCheckResult | null {
    const check = this.checks.get(name);
    if (!check || !check.lastStatus) {
      return null;
    }

    return {
      status: check.lastStatus,
      details: {
        lastRun: check.lastRun?.toISOString(),
        lastError: check.lastError,
        runCount: check.runCount,
        failureCount: check.failureCount,
      },
    };
  }

  /**
   * Force run all checks immediately
   */
  async runChecksNow(): Promise<HealthStatus> {
    this.moduleLogger.info('Running health checks on demand');
    await this.runHealthChecks();
    return this.getStatus();
  }

  /**
   * Force run specific check immediately
   */
  async runCheckNow(name: string): Promise<HealthCheckResult | null> {
    const check = this.checks.get(name);
    if (!check) {
      return null;
    }

    this.moduleLogger.info('Running specific health check on demand', { name });
    await this.runSingleCheck(name, check);
    return this.getCheckStatus(name);
  }

  /**
   * Determine overall system health status
   */
  private determineOverallStatus(): OverallHealthStatus {
    if (this.checks.size === 0) {
      return 'unknown';
    }

    const statuses = Array.from(this.checks.values()).map(check => check.lastStatus);
    
    if (statuses.some(status => status === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (statuses.some(status => status === 'warning')) {
      return 'warning';
    }
    
    if (statuses.every(status => status === 'healthy')) {
      return 'healthy';
    }
    
    return 'unknown';
  }

  /**
   * Get health check statistics
   */
  getStatistics(): HealthCheckStatistics {
    const checks = Array.from(this.checks.values());
    
    return {
      totalChecks: checks.length,
      totalRuns: checks.reduce((sum, check) => sum + check.runCount, 0),
      totalFailures: checks.reduce((sum, check) => sum + check.failureCount, 0),
      averageSuccessRate: checks.length > 0 ? 
        (checks.reduce((sum, check) => {
          const rate = check.runCount > 0 ? (check.runCount - check.failureCount) / check.runCount : 0;
          return sum + rate;
        }, 0) / checks.length * 100) : 0,
      isRunning: this.isRunning,
      lastOverallStatus: this.lastOverallStatus,
    };
  }
}

// Type definitions

export type OverallHealthStatus = 'healthy' | 'warning' | 'unhealthy' | 'unknown';

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

export interface HealthCheckResult {
  status: OverallHealthStatus;
  details?: any;
}

export interface HealthCheck {
  name: string;
  checkFunction: HealthCheckFunction;
  lastRun: Date | null;
  lastStatus: OverallHealthStatus | null;
  lastError: string | null;
  runCount: number;
  failureCount: number;
}

export interface HealthStatus {
  status: OverallHealthStatus;
  timestamp: string;
  uptime: number;
  checks: Record<string, HealthCheckResult>;
  summary: {
    total: number;
    healthy: number;
    warning: number;
    unhealthy: number;
    unknown: number;
  };
}

export interface DetailedHealthStatus extends HealthStatus {
  system: {
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: {
      used: number;
      total: number;
      external: number;
    };
    cpu: NodeJS.CpuUsage;
    pid: number;
    uptime: number;
  };
  environment: {
    nodeEnv: string;
    version: string;
  };
  healthChecks: {
    enabled: boolean;
    interval: number;
    running: boolean;
    registered: number;
  };
}

export interface HealthCheckStatistics {
  totalChecks: number;
  totalRuns: number;
  totalFailures: number;
  averageSuccessRate: number;
  isRunning: boolean;
  lastOverallStatus: OverallHealthStatus;
}

export default HealthCheckService;