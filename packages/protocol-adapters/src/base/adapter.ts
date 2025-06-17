import { EventEmitter } from 'events';
import {
  ProtocolType,
  DeviceType,
  Device,
  DeviceCommand,
  CommandResult,
  DeviceStatusUpdate,
  DeviceDiscovery,
  DeviceStatus
} from '@maestro/shared/types';

/**
 * Base Protocol Adapter Interface
 * 
 * This abstract class defines the contract that all protocol adapters must implement.
 * It provides a unified interface for device communication regardless of the underlying protocol.
 * 
 * Design Principles:
 * - Protocol agnostic: Same interface for Tuya, Modbus, MQTT, etc.
 * - Event-driven: Real-time updates via EventEmitter
 * - Extensible: Easy to add new protocols
 * - Type-safe: Full TypeScript support
 * - Error resilient: Comprehensive error handling
 */

export interface AdapterConfig {
  protocol: ProtocolType;
  name: string;
  enabled: boolean;
  connectionTimeout: number; // milliseconds
  commandTimeout: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
  maxConcurrentCommands: number;
  rateLimiting?: {
    requestsPerSecond: number;
    burstSize: number;
  };
  authentication?: Record<string, any>;
  options?: Record<string, any>;
}

export interface ConnectionStatus {
  connected: boolean;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  connectionAttempts: number;
  errorCount: number;
  lastError?: string;
}

export interface AdapterStats {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  averageResponseTime: number;
  uptime: number; // percentage
  lastCommandAt?: Date;
  bytesTransferred: number;
}

export interface DeviceInfo {
  deviceId: string;
  protocol: ProtocolType;
  deviceType: DeviceType;
  name?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  capabilities: string[];
  networkInfo?: {
    ipAddress?: string;
    macAddress?: string;
    port?: number;
    networkId?: string;
  };
  metadata?: Record<string, any>;
}

export interface EventSubscription {
  deviceId: string;
  eventTypes: string[];
  callback: (event: DeviceStatusUpdate) => void;
  subscriptionId: string;
  subscribedAt: Date;
}

/**
 * Abstract base class for all protocol adapters
 */
export abstract class BaseProtocolAdapter extends EventEmitter {
  protected config: AdapterConfig;
  protected connectionStatus: ConnectionStatus;
  protected stats: AdapterStats;
  protected activeSubscriptions: Map<string, EventSubscription>;
  protected commandQueue: Map<string, DeviceCommand[]>;
  protected isInitialized: boolean = false;

  constructor(config: AdapterConfig) {
    super();
    this.config = config;
    this.connectionStatus = {
      connected: false,
      connectionAttempts: 0,
      errorCount: 0
    };
    this.stats = {
      totalCommands: 0,
      successfulCommands: 0,
      failedCommands: 0,
      averageResponseTime: 0,
      uptime: 0,
      bytesTransferred: 0
    };
    this.activeSubscriptions = new Map();
    this.commandQueue = new Map();
  }

  // Abstract methods that must be implemented by concrete adapters

  /**
   * Initialize the adapter and establish connection
   */
  abstract initialize(): Promise<void>;

  /**
   * Cleanup and disconnect
   */
  abstract disconnect(): Promise<void>;

  /**
   * Discover devices on the network/protocol
   */
  abstract discoverDevices(filters?: Record<string, any>): Promise<DeviceDiscovery[]>;

  /**
   * Get detailed information about a specific device
   */
  abstract getDeviceInfo(deviceId: string): Promise<DeviceInfo>;

  /**
   * Send a command to a device
   */
  abstract sendCommand(deviceId: string, command: DeviceCommand): Promise<CommandResult>;

  /**
   * Get current status of a device
   */
  abstract getDeviceStatus(deviceId: string): Promise<DeviceStatusUpdate>;

  /**
   * Subscribe to real-time updates from a device
   */
  abstract subscribeToUpdates(deviceId: string, eventTypes?: string[]): Promise<EventSubscription>;

  /**
   * Unsubscribe from device updates
   */
  abstract unsubscribeFromUpdates(subscriptionId: string): Promise<void>;

  /**
   * Test connection to a specific device
   */
  abstract testDeviceConnection(deviceId: string): Promise<boolean>;

  /**
   * Get protocol-specific diagnostic information
   */
  abstract getDiagnostics(): Promise<Record<string, any>>;

  // Common methods implemented in base class

  /**
   * Get adapter configuration
   */
  getConfig(): AdapterConfig {
    return { ...this.config };
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Get adapter statistics
   */
  getStats(): AdapterStats {
    return { ...this.stats };
  }

  /**
   * Get the protocol type this adapter handles
   */
  getProtocol(): ProtocolType {
    return this.config.protocol;
  }

  /**
   * Check if adapter is connected and ready
   */
  isConnected(): boolean {
    return this.connectionStatus.connected && this.isInitialized;
  }

  /**
   * Check if adapter supports a specific device type
   */
  abstract supportsDeviceType(deviceType: DeviceType): boolean;

  /**
   * Check if adapter supports a specific capability
   */
  abstract supportsCapability(capability: string): boolean;

  /**
   * Validate a command before sending
   */
  abstract validateCommand(deviceId: string, command: DeviceCommand): Promise<boolean>;

  /**
   * Get list of active subscriptions
   */
  getActiveSubscriptions(): EventSubscription[] {
    return Array.from(this.activeSubscriptions.values());
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): EventSubscription | undefined {
    return this.activeSubscriptions.get(subscriptionId);
  }

  /**
   * Update adapter configuration
   */
  updateConfig(newConfig: Partial<AdapterConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  /**
   * Enable or disable the adapter
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.emit('enabledChanged', enabled);
  }

  // Protected utility methods

  /**
   * Record a successful command execution
   */
  protected recordCommandSuccess(responseTime: number): void {
    this.stats.totalCommands++;
    this.stats.successfulCommands++;
    this.stats.lastCommandAt = new Date();
    
    // Update average response time
    const totalTime = this.stats.averageResponseTime * (this.stats.totalCommands - 1) + responseTime;
    this.stats.averageResponseTime = totalTime / this.stats.totalCommands;
  }

  /**
   * Record a failed command execution
   */
  protected recordCommandFailure(): void {
    this.stats.totalCommands++;
    this.stats.failedCommands++;
    this.stats.lastCommandAt = new Date();
  }

  /**
   * Update connection status
   */
  protected updateConnectionStatus(connected: boolean, error?: string): void {
    const wasConnected = this.connectionStatus.connected;
    this.connectionStatus.connected = connected;
    
    if (connected) {
      this.connectionStatus.lastConnectedAt = new Date();
      this.connectionStatus.errorCount = 0;
      if (!wasConnected) {
        this.emit('connected');
      }
    } else {
      this.connectionStatus.lastDisconnectedAt = new Date();
      if (error) {
        this.connectionStatus.lastError = error;
        this.connectionStatus.errorCount++;
      }
      if (wasConnected) {
        this.emit('disconnected', error);
      }
    }
  }

  /**
   * Emit a device status update event
   */
  protected emitDeviceUpdate(update: DeviceStatusUpdate): void {
    this.emit('deviceUpdate', update);
    
    // Notify specific subscriptions
    for (const subscription of this.activeSubscriptions.values()) {
      if (subscription.deviceId === update.deviceId) {
        subscription.callback(update);
      }
    }
  }

  /**
   * Generate a unique subscription ID
   */
  protected generateSubscriptionId(): string {
    return `${this.config.protocol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add a subscription to the active subscriptions map
   */
  protected addSubscription(subscription: EventSubscription): void {
    this.activeSubscriptions.set(subscription.subscriptionId, subscription);
    this.emit('subscriptionAdded', subscription);
  }

  /**
   * Remove a subscription from the active subscriptions map
   */
  protected removeSubscription(subscriptionId: string): boolean {
    const subscription = this.activeSubscriptions.get(subscriptionId);
    if (subscription) {
      this.activeSubscriptions.delete(subscriptionId);
      this.emit('subscriptionRemoved', subscription);
      return true;
    }
    return false;
  }

  /**
   * Validate device ID format for this protocol
   */
  protected abstract validateDeviceId(deviceId: string): boolean;

  /**
   * Get default command timeout
   */
  protected getCommandTimeout(): number {
    return this.config.commandTimeout;
  }

  /**
   * Check if rate limiting is enabled and if request is allowed
   */
  protected checkRateLimit(): boolean {
    if (!this.config.rateLimiting) {
      return true;
    }
    
    // Implement rate limiting logic here
    // This is a simplified version - in production, use a proper rate limiter
    return true;
  }

  /**
   * Log adapter events for debugging and monitoring
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void {
    this.emit('log', {
      level,
      message,
      meta,
      timestamp: new Date(),
      adapter: this.config.name,
      protocol: this.config.protocol
    });
  }
}

/**
 * Adapter Events
 * 
 * All adapters emit these standardized events:
 * - 'connected': Adapter successfully connected
 * - 'disconnected': Adapter disconnected (with optional error)
 * - 'deviceUpdate': Device status update received
 * - 'deviceDiscovered': New device discovered
 * - 'subscriptionAdded': New subscription created
 * - 'subscriptionRemoved': Subscription removed
 * - 'configUpdated': Adapter configuration updated
 * - 'enabledChanged': Adapter enabled/disabled
 * - 'error': Error occurred
 * - 'log': Log message (for debugging/monitoring)
 */

export type AdapterEvent = 
  | 'connected'
  | 'disconnected'
  | 'deviceUpdate'
  | 'deviceDiscovered'
  | 'subscriptionAdded'
  | 'subscriptionRemoved'
  | 'configUpdated'
  | 'enabledChanged'
  | 'error'
  | 'log';

export interface AdapterEventData {
  connected: void;
  disconnected: string | undefined;
  deviceUpdate: DeviceStatusUpdate;
  deviceDiscovered: DeviceDiscovery;
  subscriptionAdded: EventSubscription;
  subscriptionRemoved: EventSubscription;
  configUpdated: AdapterConfig;
  enabledChanged: boolean;
  error: Error;
  log: {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    meta?: any;
    timestamp: Date;
    adapter: string;
    protocol: ProtocolType;
  };
}