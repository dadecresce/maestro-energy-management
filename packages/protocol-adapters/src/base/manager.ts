import { EventEmitter } from 'events';
import {
  ProtocolType,
  DeviceType,
  Device,
  DeviceCommand,
  CommandResult,
  DeviceStatusUpdate,
  DeviceDiscovery
} from '@maestro/shared/types';

import { BaseProtocolAdapter, AdapterConfig } from './adapter';

/**
 * Protocol Adapter Manager
 * 
 * Central hub for managing multiple protocol adapters. This class provides:
 * - Unified interface for all protocols
 * - Adapter lifecycle management
 * - Load balancing and failover
 * - Cross-protocol device management
 * - Event aggregation and routing
 */

export interface ManagerConfig {
  adapters: Record<ProtocolType, AdapterConfig>;
  defaultTimeout: number;
  maxConcurrentOperations: number;
  enableFailover: boolean;
  retryPolicy: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  healthCheck: {
    interval: number; // milliseconds
    timeout: number; // milliseconds
    failureThreshold: number;
  };
}

export interface ManagerStats {
  totalAdapters: number;
  activeAdapters: number;
  totalDevices: number;
  totalCommands: number;
  successRate: number;
  averageResponseTime: number;
  uptime: number;
  startedAt: Date;
}

export interface DeviceMap {
  deviceId: string;
  protocol: ProtocolType;
  adapter: BaseProtocolAdapter;
  lastSeen: Date;
  isActive: boolean;
}

/**
 * Protocol Adapter Manager implementation
 */
export class ProtocolAdapterManager extends EventEmitter {
  private config: ManagerConfig;
  private adapters: Map<ProtocolType, BaseProtocolAdapter>;
  private deviceMap: Map<string, DeviceMap>;
  private healthCheckInterval?: NodeJS.Timeout;
  private isInitialized: boolean = false;
  private stats: ManagerStats;

  constructor(config: ManagerConfig) {
    super();
    this.config = config;
    this.adapters = new Map();
    this.deviceMap = new Map();
    this.stats = {
      totalAdapters: 0,
      activeAdapters: 0,
      totalDevices: 0,
      totalCommands: 0,
      successRate: 0,
      averageResponseTime: 0,
      uptime: 0,
      startedAt: new Date()
    };
  }

  /**
   * Initialize the manager and all configured adapters
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Manager already initialized');
    }

    try {
      // Initialize adapters based on configuration
      for (const [protocol, adapterConfig] of Object.entries(this.config.adapters)) {
        if (adapterConfig.enabled) {
          await this.addAdapter(protocol as ProtocolType, adapterConfig);
        }
      }

      // Start health check monitoring
      this.startHealthCheck();

      this.isInitialized = true;
      this.emit('initialized');
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Shutdown the manager and all adapters
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Disconnect all adapters
    const disconnectPromises = Array.from(this.adapters.values()).map(
      adapter => adapter.disconnect()
    );

    await Promise.allSettled(disconnectPromises);

    this.adapters.clear();
    this.deviceMap.clear();
    this.isInitialized = false;

    this.emit('shutdown');
  }

  /**
   * Add a new protocol adapter
   */
  async addAdapter(protocol: ProtocolType, config: AdapterConfig): Promise<void> {
    if (this.adapters.has(protocol)) {
      throw new Error(`Adapter for protocol ${protocol} already exists`);
    }

    try {
      // Dynamic adapter loading based on protocol
      const adapter = await this.createAdapter(protocol, config);
      
      // Set up event listeners
      this.setupAdapterEvents(adapter);
      
      // Initialize the adapter
      await adapter.initialize();
      
      this.adapters.set(protocol, adapter);
      this.stats.totalAdapters++;
      
      if (adapter.isConnected()) {
        this.stats.activeAdapters++;
      }

      this.emit('adapterAdded', { protocol, adapter });
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Remove a protocol adapter
   */
  async removeAdapter(protocol: ProtocolType): Promise<void> {
    const adapter = this.adapters.get(protocol);
    if (!adapter) {
      throw new Error(`No adapter found for protocol ${protocol}`);
    }

    try {
      // Remove device mappings for this adapter
      for (const [deviceId, deviceMap] of this.deviceMap.entries()) {
        if (deviceMap.protocol === protocol) {
          this.deviceMap.delete(deviceId);
        }
      }

      // Disconnect and remove adapter
      await adapter.disconnect();
      this.adapters.delete(protocol);
      this.stats.totalAdapters--;

      this.emit('adapterRemoved', { protocol });
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get adapter for a specific protocol
   */
  getAdapter(protocol: ProtocolType): BaseProtocolAdapter | undefined {
    return this.adapters.get(protocol);
  }

  /**
   * Get all active adapters
   */
  getActiveAdapters(): BaseProtocolAdapter[] {
    return Array.from(this.adapters.values()).filter(adapter => adapter.isConnected());
  }

  /**
   * Discover devices across all protocols
   */
  async discoverDevices(protocolFilter?: ProtocolType[], deviceTypeFilter?: DeviceType[]): Promise<DeviceDiscovery[]> {
    const adaptersToQuery = protocolFilter 
      ? Array.from(this.adapters.entries()).filter(([protocol]) => protocolFilter.includes(protocol))
      : Array.from(this.adapters.entries());

    const discoveryPromises = adaptersToQuery.map(async ([protocol, adapter]) => {
      if (!adapter.isConnected()) {
        return [];
      }

      try {
        const devices = await adapter.discoverDevices();
        
        // Apply device type filter if specified
        return deviceTypeFilter 
          ? devices.filter(device => deviceTypeFilter.includes(device.deviceType))
          : devices;
          
      } catch (error) {
        this.emit('error', error);
        return [];
      }
    });

    const results = await Promise.allSettled(discoveryPromises);
    const discoveries = results
      .filter((result): result is PromiseFulfilledResult<DeviceDiscovery[]> => result.status === 'fulfilled')
      .flatMap(result => result.value);

    // Update device mappings
    for (const discovery of discoveries) {
      this.updateDeviceMap(discovery);
    }

    return discoveries;
  }

  /**
   * Send command to a device (auto-routes to correct adapter)
   */
  async sendCommand(deviceId: string, command: DeviceCommand): Promise<CommandResult> {
    const deviceMap = this.deviceMap.get(deviceId);
    if (!deviceMap) {
      throw new Error(`Device ${deviceId} not found in device map`);
    }

    if (!deviceMap.adapter.isConnected()) {
      throw new Error(`Adapter for device ${deviceId} is not connected`);
    }

    const startTime = Date.now();
    
    try {
      const result = await deviceMap.adapter.sendCommand(deviceId, command);
      const responseTime = Date.now() - startTime;
      
      // Update statistics
      this.stats.totalCommands++;
      this.updateSuccessRate(true);
      this.updateAverageResponseTime(responseTime);
      
      // Update device last seen
      deviceMap.lastSeen = new Date();
      
      return result;
      
    } catch (error) {
      this.updateSuccessRate(false);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get device status (auto-routes to correct adapter)
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatusUpdate> {
    const deviceMap = this.deviceMap.get(deviceId);
    if (!deviceMap) {
      throw new Error(`Device ${deviceId} not found in device map`);
    }

    try {
      const status = await deviceMap.adapter.getDeviceStatus(deviceId);
      
      // Update device last seen
      deviceMap.lastSeen = new Date();
      
      return status;
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Subscribe to device updates (auto-routes to correct adapter)
   */
  async subscribeToDeviceUpdates(deviceId: string, callback: (update: DeviceStatusUpdate) => void): Promise<string> {
    const deviceMap = this.deviceMap.get(deviceId);
    if (!deviceMap) {
      throw new Error(`Device ${deviceId} not found in device map`);
    }

    try {
      const subscription = await deviceMap.adapter.subscribeToUpdates(deviceId);
      
      // Wrap the callback to emit manager-level events
      const wrappedCallback = (update: DeviceStatusUpdate) => {
        this.emit('deviceUpdate', update);
        callback(update);
      };
      
      // Replace the original callback
      subscription.callback = wrappedCallback;
      
      return subscription.subscriptionId;
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get manager statistics
   */
  getStats(): ManagerStats {
    // Update uptime
    const now = Date.now();
    const uptime = (now - this.stats.startedAt.getTime()) / 1000; // seconds
    this.stats.uptime = uptime;

    // Update active adapters count
    this.stats.activeAdapters = this.getActiveAdapters().length;
    
    // Update total devices count
    this.stats.totalDevices = this.deviceMap.size;

    return { ...this.stats };
  }

  /**
   * Get device map information
   */
  getDeviceMap(): Map<string, DeviceMap> {
    return new Map(this.deviceMap);
  }

  /**
   * Test connection to all adapters
   */
  async testConnections(): Promise<Record<ProtocolType, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [protocol, adapter] of this.adapters.entries()) {
      try {
        results[protocol] = adapter.isConnected();
      } catch (error) {
        results[protocol] = false;
      }
    }
    
    return results as Record<ProtocolType, boolean>;
  }

  // Private methods

  /**
   * Create adapter instance based on protocol type
   */
  private async createAdapter(protocol: ProtocolType, config: AdapterConfig): Promise<BaseProtocolAdapter> {
    switch (protocol) {
      case 'tuya':
        const { TuyaAdapter } = await import('../tuya/adapter');
        return new TuyaAdapter(config);
        
      case 'modbus':
        const { ModbusAdapter } = await import('../modbus/adapter');
        return new ModbusAdapter(config);
        
      case 'mqtt':
        const { MQTTAdapter } = await import('../mqtt/adapter');
        return new MQTTAdapter(config);
        
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  /**
   * Set up event listeners for an adapter
   */
  private setupAdapterEvents(adapter: BaseProtocolAdapter): void {
    adapter.on('connected', () => {
      this.stats.activeAdapters++;
      this.emit('adapterConnected', adapter.getProtocol());
    });

    adapter.on('disconnected', (error) => {
      this.stats.activeAdapters--;
      this.emit('adapterDisconnected', adapter.getProtocol(), error);
    });

    adapter.on('deviceUpdate', (update: DeviceStatusUpdate) => {
      this.emit('deviceUpdate', update);
    });

    adapter.on('error', (error) => {
      this.emit('adapterError', adapter.getProtocol(), error);
    });
  }

  /**
   * Update device mapping from discovery
   */
  private updateDeviceMap(discovery: DeviceDiscovery): void {
    const adapter = this.adapters.get(discovery.protocol);
    if (!adapter) {
      return;
    }

    this.deviceMap.set(discovery.deviceId, {
      deviceId: discovery.deviceId,
      protocol: discovery.protocol,
      adapter,
      lastSeen: discovery.discoveredAt,
      isActive: true
    });
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheck.interval);
  }

  /**
   * Perform health check on all adapters
   */
  private async performHealthCheck(): Promise<void> {
    for (const [protocol, adapter] of this.adapters.entries()) {
      try {
        const wasConnected = adapter.isConnected();
        
        // Perform adapter-specific health check
        const diagnostics = await Promise.race([
          adapter.getDiagnostics(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheck.timeout)
          )
        ]);

        if (!wasConnected && adapter.isConnected()) {
          this.emit('adapterRecovered', protocol);
        }
        
      } catch (error) {
        this.emit('adapterHealthCheckFailed', protocol, error);
        
        // If adapter was connected but now failing, mark as disconnected
        if (adapter.isConnected()) {
          adapter['updateConnectionStatus'](false, `Health check failed: ${error}`);
        }
      }
    }
  }

  /**
   * Update success rate statistics
   */
  private updateSuccessRate(success: boolean): void {
    const totalCommands = this.stats.totalCommands;
    const currentSuccessful = Math.round(this.stats.successRate * (totalCommands - 1));
    const newSuccessful = currentSuccessful + (success ? 1 : 0);
    this.stats.successRate = newSuccessful / totalCommands;
  }

  /**
   * Update average response time statistics
   */
  private updateAverageResponseTime(responseTime: number): void {
    const totalCommands = this.stats.totalCommands;
    const currentTotal = this.stats.averageResponseTime * (totalCommands - 1);
    this.stats.averageResponseTime = (currentTotal + responseTime) / totalCommands;
  }
}