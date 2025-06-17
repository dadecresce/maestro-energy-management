import { EventEmitter } from 'events';
import { 
  BaseProtocolAdapter, 
  AdapterConfig,
  AdapterEvent,
  AdapterEventData 
} from '@maestro/protocol-adapters/base/adapter';
import { TuyaAdapter, TuyaConfig } from '@maestro/protocol-adapters/tuya/adapter';
import { ProtocolType, DeviceStatusUpdate, DeviceDiscovery } from '@maestro/shared/types';
import { config } from '@/config/environment';
import logger, { createModuleLogger, deviceLogger } from '@/config/logger';
import { createError } from '@/utils/errors';

/**
 * Protocol Adapter Manager
 * 
 * Manages multiple protocol adapters and provides a unified interface
 * for device communication across different IoT protocols
 */
export class ProtocolAdapterManager extends EventEmitter {
  private adapters: Map<ProtocolType, BaseProtocolAdapter> = new Map();
  private isInitialized = false;
  private moduleLogger = createModuleLogger('ProtocolAdapterManager');

  constructor() {
    super();
    this.moduleLogger.info('Protocol adapter manager initialized');
  }

  /**
   * Initialize all configured protocol adapters
   */
  async initialize(): Promise<void> {
    try {
      this.moduleLogger.info('Initializing protocol adapters...');

      // Initialize Tuya adapter
      await this.initializeTuyaAdapter();

      // TODO: Initialize other adapters (Modbus, MQTT, etc.)
      // await this.initializeModbusAdapter();
      // await this.initializeMqttAdapter();

      this.isInitialized = true;
      this.moduleLogger.info(`Protocol adapters initialized successfully (${this.adapters.size} adapters)`);

    } catch (error) {
      this.moduleLogger.error('Failed to initialize protocol adapters', { error });
      throw createError.internal('Protocol adapter initialization failed', { originalError: error });
    }
  }

  /**
   * Shutdown all protocol adapters
   */
  async shutdown(): Promise<void> {
    try {
      this.moduleLogger.info('Shutting down protocol adapters...');

      const shutdownPromises = Array.from(this.adapters.values()).map(async (adapter) => {
        try {
          await adapter.disconnect();
          this.moduleLogger.info(`Adapter ${adapter.getProtocol()} shut down successfully`);
        } catch (error) {
          this.moduleLogger.error(`Failed to shutdown adapter ${adapter.getProtocol()}`, { error });
        }
      });

      await Promise.allSettled(shutdownPromises);
      
      this.adapters.clear();
      this.isInitialized = false;
      this.moduleLogger.info('All protocol adapters shut down');

    } catch (error) {
      this.moduleLogger.error('Error during protocol adapters shutdown', { error });
      throw error;
    }
  }

  /**
   * Get adapter by protocol type
   */
  getAdapter(protocol: ProtocolType): BaseProtocolAdapter | undefined {
    return this.adapters.get(protocol);
  }

  /**
   * Get all adapters
   */
  getAdapters(): BaseProtocolAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapter status summary
   */
  getAdapterStatus(): Array<{
    protocol: ProtocolType;
    connected: boolean;
    lastError?: string;
    stats: any;
  }> {
    return Array.from(this.adapters.entries()).map(([protocol, adapter]) => {
      const status = adapter.getConnectionStatus();
      const stats = adapter.getStats();
      
      return {
        protocol,
        connected: adapter.isConnected(),
        lastError: status.lastError,
        stats,
      };
    });
  }

  /**
   * Discover devices across all adapters or specific protocol
   */
  async discoverDevices(protocol?: ProtocolType, filters?: Record<string, any>): Promise<DeviceDiscovery[]> {
    try {
      const adaptersToUse = protocol 
        ? [this.getAdapter(protocol)].filter(Boolean) as BaseProtocolAdapter[]
        : this.getAdapters();

      if (adaptersToUse.length === 0) {
        throw createError.notFound(`No adapters available for protocol: ${protocol || 'any'}`);
      }

      const discoveryPromises = adaptersToUse.map(async (adapter) => {
        try {
          const devices = await adapter.discoverDevices(filters);
          deviceLogger.discovery(adapter.getProtocol(), devices.length);
          return devices;
        } catch (error) {
          this.moduleLogger.error(`Discovery failed for ${adapter.getProtocol()}`, { error });
          deviceLogger.error('discovery', adapter.getProtocol(), error instanceof Error ? error.message : 'Unknown error');
          return [];
        }
      });

      const results = await Promise.allSettled(discoveryPromises);
      const allDevices = results
        .filter((result): result is PromisedResolvedResult<DeviceDiscovery[]> => result.status === 'fulfilled')
        .flatMap(result => result.value);

      this.moduleLogger.info(`Device discovery completed: ${allDevices.length} devices found`);
      return allDevices;

    } catch (error) {
      this.moduleLogger.error('Device discovery failed', { error, protocol, filters });
      throw createError.internal('Device discovery failed', { originalError: error });
    }
  }

  /**
   * Send command to device via appropriate adapter
   */
  async sendDeviceCommand(
    protocol: ProtocolType, 
    deviceId: string, 
    command: string, 
    parameters: Record<string, any> = {}
  ): Promise<any> {
    try {
      const adapter = this.getAdapter(protocol);
      if (!adapter) {
        throw createError.notFound(`No adapter found for protocol: ${protocol}`);
      }

      if (!adapter.isConnected()) {
        throw createError.serviceUnavailable(`Adapter for ${protocol} is not connected`);
      }

      const startTime = Date.now();
      const result = await adapter.sendCommand(deviceId, { command, parameters });
      const duration = Date.now() - startTime;

      deviceLogger.command(deviceId, command, result.success, duration);

      if (!result.success) {
        throw createError.deviceCommand(deviceId, command, result.error || 'Command failed');
      }

      return result;

    } catch (error) {
      this.moduleLogger.error('Device command failed', { protocol, deviceId, command, error });
      
      if (createError.isApiError(error)) {
        throw error;
      }
      
      throw createError.deviceCommand(deviceId, command, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get device status via appropriate adapter
   */
  async getDeviceStatus(protocol: ProtocolType, deviceId: string): Promise<DeviceStatusUpdate> {
    try {
      const adapter = this.getAdapter(protocol);
      if (!adapter) {
        throw createError.notFound(`No adapter found for protocol: ${protocol}`);
      }

      if (!adapter.isConnected()) {
        throw createError.serviceUnavailable(`Adapter for ${protocol} is not connected`);
      }

      const status = await adapter.getDeviceStatus(deviceId);
      deviceLogger.statusUpdate(deviceId, status.status, 'adapter');

      return status;

    } catch (error) {
      this.moduleLogger.error('Get device status failed', { protocol, deviceId, error });
      
      if (createError.isApiError(error)) {
        throw error;
      }
      
      throw createError.device(`Failed to get device status: ${error instanceof Error ? error.message : 'Unknown error'}`, deviceId);
    }
  }

  /**
   * Test device connectivity
   */
  async testDeviceConnection(protocol: ProtocolType, deviceId: string): Promise<boolean> {
    try {
      const adapter = this.getAdapter(protocol);
      if (!adapter) {
        throw createError.notFound(`No adapter found for protocol: ${protocol}`);
      }

      return await adapter.testDeviceConnection(deviceId);

    } catch (error) {
      this.moduleLogger.error('Device connection test failed', { protocol, deviceId, error });
      return false;
    }
  }

  /**
   * Get detailed diagnostics for all adapters
   */
  async getDiagnostics(): Promise<Record<ProtocolType, any>> {
    const diagnostics: Record<string, any> = {};

    const diagnosticPromises = Array.from(this.adapters.entries()).map(async ([protocol, adapter]) => {
      try {
        const adapterDiagnostics = await adapter.getDiagnostics();
        diagnostics[protocol] = adapterDiagnostics;
      } catch (error) {
        diagnostics[protocol] = {
          error: error instanceof Error ? error.message : 'Unknown error',
          connected: false,
        };
      }
    });

    await Promise.allSettled(diagnosticPromises);
    return diagnostics;
  }

  /**
   * Initialize Tuya adapter
   */
  private async initializeTuyaAdapter(): Promise<void> {
    try {
      const tuyaConfig: TuyaConfig = {
        protocol: 'tuya',
        name: 'Tuya Cloud Adapter',
        enabled: true,
        connectionTimeout: 10000,
        commandTimeout: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
        maxConcurrentCommands: 10,
        rateLimiting: {
          requestsPerSecond: 10,
          burstSize: 20,
        },
        authentication: {
          clientId: config.tuya.clientId,
          clientSecret: config.tuya.clientSecret,
          baseUrl: config.tuya.baseUrl,
          region: config.tuya.region,
        },
        options: {
          pollingInterval: config.devices.pollingInterval,
          enableWebhooks: false, // Phase 2 feature
          maxDevicesPerRequest: 100,
          cacheTTL: 300000, // 5 minutes
        },
      };

      const tuyaAdapter = new TuyaAdapter(tuyaConfig);
      
      // Setup event handlers
      this.setupAdapterEventHandlers(tuyaAdapter);
      
      // Initialize the adapter
      await tuyaAdapter.initialize();
      
      // Register the adapter
      this.adapters.set('tuya', tuyaAdapter);
      
      this.moduleLogger.info('Tuya adapter initialized successfully');

    } catch (error) {
      this.moduleLogger.error('Failed to initialize Tuya adapter', { error });
      throw error;
    }
  }

  /**
   * Setup event handlers for an adapter
   */
  private setupAdapterEventHandlers(adapter: BaseProtocolAdapter): void {
    const protocol = adapter.getProtocol();

    adapter.on('connected', () => {
      this.moduleLogger.info(`Adapter ${protocol} connected`);
      this.emit('adapterConnected', protocol);
    });

    adapter.on('disconnected', (error?: string) => {
      this.moduleLogger.warn(`Adapter ${protocol} disconnected`, { error });
      this.emit('adapterDisconnected', protocol, error);
    });

    adapter.on('deviceUpdate', (update: DeviceStatusUpdate) => {
      this.moduleLogger.debug(`Device update from ${protocol}`, {
        deviceId: update.deviceId,
        status: update.status,
      });
      this.emit('deviceUpdate', update);
    });

    adapter.on('error', (error: Error) => {
      this.moduleLogger.error(`Adapter ${protocol} error`, { error });
      this.emit('adapterError', protocol, error);
    });

    adapter.on('log', (logData: any) => {
      // Forward adapter logs to main logger
      logger.log(logData.level, logData.message, {
        ...logData.meta,
        adapter: logData.adapter,
        protocol: logData.protocol,
      });
    });
  }

  /**
   * Check if manager is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.adapters.size > 0;
  }

  /**
   * Get adapter by device ID (if device protocol is known)
   */
  getAdapterForDevice(deviceProtocol: ProtocolType): BaseProtocolAdapter {
    const adapter = this.getAdapter(deviceProtocol);
    if (!adapter) {
      throw createError.notFound(`No adapter found for protocol: ${deviceProtocol}`);
    }
    if (!adapter.isConnected()) {
      throw createError.serviceUnavailable(`Adapter for ${deviceProtocol} is not connected`);
    }
    return adapter;
  }

  /**
   * Subscribe to device updates from all adapters
   */
  async subscribeToDeviceUpdates(deviceId: string, protocol: ProtocolType): Promise<string> {
    try {
      const adapter = this.getAdapterForDevice(protocol);
      const subscription = await adapter.subscribeToUpdates(deviceId);
      
      this.moduleLogger.info('Subscribed to device updates', {
        deviceId,
        protocol,
        subscriptionId: subscription.subscriptionId,
      });

      return subscription.subscriptionId;

    } catch (error) {
      this.moduleLogger.error('Failed to subscribe to device updates', { deviceId, protocol, error });
      throw error;
    }
  }

  /**
   * Unsubscribe from device updates
   */
  async unsubscribeFromDeviceUpdates(subscriptionId: string, protocol: ProtocolType): Promise<void> {
    try {
      const adapter = this.getAdapter(protocol);
      if (adapter) {
        await adapter.unsubscribeFromUpdates(subscriptionId);
        this.moduleLogger.info('Unsubscribed from device updates', { subscriptionId, protocol });
      }
    } catch (error) {
      this.moduleLogger.error('Failed to unsubscribe from device updates', { subscriptionId, protocol, error });
      throw error;
    }
  }
}

export default ProtocolAdapterManager;