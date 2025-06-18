import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  DeviceType,
  DeviceCommand,
  CommandResult,
  DeviceStatusUpdate,
  DeviceDiscovery,
  DeviceStatus
} from '@maestro/shared/types';

import { 
  BaseProtocolAdapter, 
  AdapterConfig, 
  DeviceInfo, 
  EventSubscription 
} from '../base/adapter';

/**
 * Tuya Cloud API Adapter
 * 
 * Implements the BaseProtocolAdapter for Tuya Cloud API integration.
 * Supports smart plugs and other Tuya-compatible devices.
 * 
 * Features:
 * - OAuth 2.0 authentication
 * - Real-time device status via polling (WebSocket planned for Phase 2)
 * - Rate limiting compliance
 * - Error handling and retry logic
 * - Device capability mapping
 */

export interface TuyaConfig extends AdapterConfig {
  authentication: {
    clientId: string;
    clientSecret: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: number;
    baseUrl?: string; // Default: https://openapi.tuyaeu.com
    region?: 'us' | 'eu' | 'cn' | 'in'; // Default: eu
  };
  options: {
    pollingInterval?: number; // milliseconds, default: 30000
    enableWebhooks?: boolean; // Phase 2 feature
    webhookUrl?: string;
    maxDevicesPerRequest?: number; // default: 100
    cacheTTL?: number; // Cache time-to-live in milliseconds
  };
}

interface TuyaDevice {
  id: string;
  name: string;
  local_key: string;
  category: string;
  product_id: string;
  product_name: string;
  sub_category: string;
  icon: string;
  ip: string;
  lat: string;
  lon: string;
  model: string;
  time_zone: string;
  active_time: number;
  create_time: number;
  update_time: number;
  online: boolean;
  status: Array<{
    code: string;
    value: any;
    type: string;
  }>;
  functions?: Array<{
    code: string;
    desc: string;
    name: string;
    type: string;
    values: string;
  }>;
}

interface TuyaApiResponse<T = any> {
  success: boolean;
  t: number;
  tid: string;
  result: T;
  code?: number;
  msg?: string;
}

/**
 * Tuya Protocol Adapter Implementation
 */
export class TuyaAdapter extends BaseProtocolAdapter {
  private apiClient: AxiosInstance;
  private pollingInterval?: NodeJS.Timeout;
  private deviceCache: Map<string, TuyaDevice>;
  private lastPollTime: number = 0;

  constructor(config: TuyaConfig) {
    super(config);
    
    this.deviceCache = new Map();
    
    // Initialize Axios client with Tuya API configuration
    this.apiClient = axios.create({
      baseURL: this.getTuyaConfig().authentication.baseUrl || 'https://openapi.tuyaeu.com',
      timeout: config.connectionTimeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    // Set up request interceptor for authentication
    this.setupRequestInterceptor();
    
    // Set up response interceptor for error handling
    this.setupResponseInterceptor();
  }

  /**
   * Initialize the Tuya adapter
   */
  async initialize(): Promise<void> {
    try {
      // Ensure we have valid authentication
      await this.ensureAuthentication();
      
      // Test the connection
      await this.testConnection();
      
      // Start polling for device updates
      this.startPolling();
      
      this.updateConnectionStatus(true);
      this.isInitialized = true;
      
      this.log('info', 'Tuya adapter initialized successfully');
      
    } catch (error) {
      this.updateConnectionStatus(false, `Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Disconnect from Tuya Cloud API
   */
  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    
    this.deviceCache.clear();
    this.updateConnectionStatus(false);
    
    this.log('info', 'Tuya adapter disconnected');
  }

  /**
   * Discover Tuya devices
   */
  async discoverDevices(filters?: Record<string, any>): Promise<DeviceDiscovery[]> {
    try {
      const devices = await this.getTuyaDevices();
      const discoveries: DeviceDiscovery[] = [];
      
      for (const device of devices) {
        // Apply filters if provided
        if (filters) {
          if (filters.category && device.category !== filters.category) continue;
          if (filters.online !== undefined && device.online !== filters.online) continue;
        }
        
        // Convert Tuya device to DeviceDiscovery
        const discovery = this.mapTuyaDeviceToDiscovery(device);
        discoveries.push(discovery);
        
        // Cache the device
        this.deviceCache.set(device.id, device);
      }
      
      this.log('info', `Discovered ${discoveries.length} Tuya devices`);
      return discoveries;
      
    } catch (error) {
      this.log('error', 'Failed to discover devices', error);
      throw error;
    }
  }

  /**
   * Get detailed device information
   */
  async getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
    try {
      let device = this.deviceCache.get(deviceId);
      
      if (!device) {
        // Fetch device from API
        const response = await this.apiRequest<TuyaDevice>('GET', `/v1.0/devices/${deviceId}`);
        device = response.result;
        this.deviceCache.set(deviceId, device);
      }
      
      return this.mapTuyaDeviceToInfo(device);
      
    } catch (error) {
      this.log('error', `Failed to get device info for ${deviceId}`, error);
      throw error;
    }
  }

  /**
   * Send command to Tuya device
   */
  async sendCommand(deviceId: string, command: DeviceCommand): Promise<CommandResult> {
    const startTime = Date.now();
    
    try {
      // Validate command
      await this.validateCommand(deviceId, command);
      
      // Convert command to Tuya format
      const tuyaCommand = this.mapCommandToTuya(command);
      
      // Send command to Tuya API
      const response = await this.apiRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
        commands: [tuyaCommand]
      });
      
      const responseTime = Date.now() - startTime;
      this.recordCommandSuccess(responseTime);
      
      const result: CommandResult = {
        success: response.success,
        timestamp: new Date(),
        responseTime,
        retryCount: 0,
        result: response.result
      };
      
      this.log('debug', `Command sent to device ${deviceId}`, { command, result });
      return result;
      
    } catch (error) {
      this.recordCommandFailure();
      this.log('error', `Failed to send command to device ${deviceId}`, { command, error });
      
      return {
        success: false,
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        retryCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current device status
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatusUpdate> {
    try {
      const response = await this.apiRequest<TuyaDevice>('GET', `/v1.0/devices/${deviceId}/status`);
      const device = response.result;
      
      // Update cache
      this.deviceCache.set(deviceId, device);
      
      return this.mapTuyaDeviceToStatus(device);
      
    } catch (error) {
      this.log('error', `Failed to get device status for ${deviceId}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to device updates (polling-based for MVP)
   */
  async subscribeToUpdates(deviceId: string, eventTypes?: string[]): Promise<EventSubscription> {
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription: EventSubscription = {
      deviceId,
      eventTypes: eventTypes || ['status_update'],
      callback: (update) => {
        // This will be called by the polling mechanism
      },
      subscriptionId,
      subscribedAt: new Date()
    };
    
    this.addSubscription(subscription);
    
    this.log('debug', `Subscribed to updates for device ${deviceId}`, { subscriptionId });
    return subscription;
  }

  /**
   * Unsubscribe from device updates
   */
  async unsubscribeFromUpdates(subscriptionId: string): Promise<void> {
    const removed = this.removeSubscription(subscriptionId);
    if (!removed) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    this.log('debug', `Unsubscribed from updates`, { subscriptionId });
  }

  /**
   * Test connection to specific device
   */
  async testDeviceConnection(deviceId: string): Promise<boolean> {
    try {
      await this.getDeviceStatus(deviceId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Tuya-specific diagnostics
   */
  async getDiagnostics(): Promise<Record<string, any>> {
    const config = this.getTuyaConfig();
    
    return {
      protocol: 'tuya',
      connected: this.isConnected(),
      apiBaseUrl: config.authentication.baseUrl,
      region: config.authentication.region,
      tokenValid: await this.isTokenValid(),
      cachedDevices: this.deviceCache.size,
      lastPollTime: new Date(this.lastPollTime),
      pollingInterval: config.options.pollingInterval,
      rateLimiting: config.rateLimiting
    };
  }

  /**
   * Check if adapter supports a device type
   */
  supportsDeviceType(deviceType: DeviceType): boolean {
    const supportedTypes: DeviceType[] = [
      'smart_plug',
      // Add more supported device types as needed
    ];
    return supportedTypes.includes(deviceType);
  }

  /**
   * Check if adapter supports a capability
   */
  supportsCapability(capability: string): boolean {
    const supportedCapabilities = [
      'switch',
      'energy_meter',
      'scheduler',
      // Add more capabilities as supported by Tuya devices
    ];
    return supportedCapabilities.includes(capability);
  }

  /**
   * Validate command before sending
   */
  async validateCommand(deviceId: string, command: DeviceCommand): Promise<boolean> {
    // Basic validation
    if (!this.validateDeviceId(deviceId)) {
      throw new Error(`Invalid device ID format: ${deviceId}`);
    }
    
    // Check if device exists in cache
    const device = this.deviceCache.get(deviceId);
    if (!device) {
      // Try to fetch device info
      await this.getDeviceInfo(deviceId);
    }
    
    // Validate command parameters based on device capabilities
    // This would be expanded based on specific Tuya device capabilities
    
    return true;
  }

  /**
   * Validate Tuya device ID format
   */
  protected validateDeviceId(deviceId: string): boolean {
    // Tuya device IDs are typically alphanumeric strings
    return /^[a-zA-Z0-9]+$/.test(deviceId) && deviceId.length >= 10;
  }

  // Private helper methods

  /**
   * Get typed Tuya configuration
   */
  private getTuyaConfig(): TuyaConfig {
    return this.config as TuyaConfig;
  }

  /**
   * Set up request interceptor for authentication
   */
  private setupRequestInterceptor(): void {
    this.apiClient.interceptors.request.use(async (config) => {
      const tuyaConfig = this.getTuyaConfig();
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');
      
      // Ensure we have a valid token
      await this.ensureAuthentication();
      
      const accessToken = tuyaConfig.authentication.accessToken;
      if (!accessToken) {
        throw new Error('No access token available');
      }
      
      // Create signature for Tuya API
      const signature = this.createSignature(config, timestamp, nonce, accessToken);
      
      // Add required headers
      if (!config.headers) {
        config.headers = {} as any;
      }
      Object.assign(config.headers, {
        'client_id': tuyaConfig.authentication.clientId,
        'access_token': accessToken,
        't': timestamp,
        'sign_method': 'HMAC-SHA256',
        'nonce': nonce,
        'sign': signature
      });
      
      return config;
    });
  }

  /**
   * Set up response interceptor for error handling
   */
  private setupResponseInterceptor(): void {
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          try {
            await this.refreshToken();
            // Retry the original request
            return this.apiClient.request(error.config);
          } catch (refreshError) {
            this.updateConnectionStatus(false, 'Authentication failed');
            throw refreshError;
          }
        }
        throw error;
      }
    );
  }

  /**
   * Ensure we have valid authentication
   */
  private async ensureAuthentication(): Promise<void> {
    const config = this.getTuyaConfig();
    
    if (!config.authentication.accessToken || !await this.isTokenValid()) {
      if (config.authentication.refreshToken) {
        await this.refreshToken();
      } else {
        throw new Error('No valid authentication token available');
      }
    }
  }

  /**
   * Check if current token is valid
   */
  private async isTokenValid(): Promise<boolean> {
    const config = this.getTuyaConfig();
    
    if (!config.authentication.accessToken || !config.authentication.tokenExpiresAt) {
      return false;
    }
    
    // Check if token expires in the next 5 minutes
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() < (config.authentication.tokenExpiresAt - expirationBuffer);
  }

  /**
   * Refresh authentication token
   */
  private async refreshToken(): Promise<void> {
    const config = this.getTuyaConfig();
    
    if (!config.authentication.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    try {
      const response = await axios.post(`${config.authentication.baseUrl}/v1.0/token/${config.authentication.refreshToken}`, {}, {
        headers: {
          'client_id': config.authentication.clientId,
          'sign': this.createTokenSignature(config.authentication.refreshToken)
        }
      });
      
      const tokenData = response.data.result;
      config.authentication.accessToken = tokenData.access_token;
      config.authentication.refreshToken = tokenData.refresh_token;
      config.authentication.tokenExpiresAt = Date.now() + (tokenData.expire_time * 1000);
      
      this.log('debug', 'Token refreshed successfully');
      
    } catch (error) {
      this.log('error', 'Failed to refresh token', error);
      throw error;
    }
  }

  /**
   * Create signature for Tuya API requests
   */
  private createSignature(config: any, timestamp: string, nonce: string, accessToken: string): string {
    const tuyaConfig = this.getTuyaConfig();
    const method = config.method?.toUpperCase() || 'GET';
    const url = config.url || '';
    const body = config.data ? JSON.stringify(config.data) : '';
    
    const stringToSign = [
      method,
      crypto.createHash('sha256').update(body).digest('hex'),
      '',
      url
    ].join('\n');
    
    const signStr = tuyaConfig.authentication.clientId + accessToken + timestamp + nonce + stringToSign;
    
    return crypto
      .createHmac('sha256', tuyaConfig.authentication.clientSecret)
      .update(signStr)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Create signature for token refresh
   */
  private createTokenSignature(refreshToken: string): string {
    const config = this.getTuyaConfig();
    const timestamp = Date.now().toString();
    
    const signStr = config.authentication.clientId + timestamp + refreshToken;
    
    return crypto
      .createHmac('sha256', config.authentication.clientSecret)
      .update(signStr)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Test API connection
   */
  private async testConnection(): Promise<void> {
    try {
      await this.apiRequest('GET', '/v1.0/token/' + this.getTuyaConfig().authentication.accessToken);
    } catch (error) {
      throw new Error(`Tuya API connection test failed: ${error}`);
    }
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T = any>(method: string, url: string, data?: any): Promise<TuyaApiResponse<T>> {
    try {
      const response = await this.apiClient.request({
        method: method as any,
        url,
        data
      });
      
      const apiResponse: TuyaApiResponse<T> = response.data;
      
      if (!apiResponse.success) {
        throw new Error(`Tuya API error: ${apiResponse.msg} (Code: ${apiResponse.code})`);
      }
      
      return apiResponse;
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API request failed: ${error.response?.status} ${error.response?.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Get all Tuya devices for the authenticated user
   */
  private async getTuyaDevices(): Promise<TuyaDevice[]> {
    const response = await this.apiRequest<{ devices: TuyaDevice[] }>('GET', '/v1.0/users/{uid}/devices');
    return response.result.devices || [];
  }

  /**
   * Start polling for device status updates
   */
  private startPolling(): void {
    const config = this.getTuyaConfig();
    const interval = config.options.pollingInterval || 30000; // 30 seconds default
    
    this.pollingInterval = setInterval(async () => {
      await this.pollDeviceUpdates();
    }, interval);
    
    this.log('debug', `Started polling with interval ${interval}ms`);
  }

  /**
   * Poll for device status updates
   */
  private async pollDeviceUpdates(): Promise<void> {
    try {
      const devices = await this.getTuyaDevices();
      
      for (const device of devices) {
        const previousDevice = this.deviceCache.get(device.id);
        
        if (previousDevice && this.hasDeviceStatusChanged(previousDevice, device)) {
          const statusUpdate = this.mapTuyaDeviceToStatus(device);
          this.emitDeviceUpdate(statusUpdate);
        }
        
        this.deviceCache.set(device.id, device);
      }
      
      this.lastPollTime = Date.now();
      
    } catch (error) {
      this.log('error', 'Polling failed', error);
    }
  }

  /**
   * Check if device status has changed
   */
  private hasDeviceStatusChanged(previous: TuyaDevice, current: TuyaDevice): boolean {
    if (previous.online !== current.online) return true;
    if (previous.update_time !== current.update_time) return true;
    
    // Compare status arrays
    if (previous.status.length !== current.status.length) return true;
    
    for (let i = 0; i < previous.status.length; i++) {
      const prev = previous.status[i];
      const curr = current.status[i];
      
      if (prev.code !== curr.code || prev.value !== curr.value) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Map Tuya device to DeviceDiscovery
   */
  private mapTuyaDeviceToDiscovery(device: TuyaDevice): DeviceDiscovery {
    return {
      protocol: 'tuya',
      deviceId: device.id,
      deviceType: this.mapTuyaCategoryToDeviceType(device.category),
      name: device.name,
      specifications: {
        manufacturer: 'Tuya',
        model: device.product_name,
        firmwareVersion: undefined // Not available in basic device info
      },
      capabilities: this.mapTuyaFunctionsToCapabilities(device.functions || []),
      networkInfo: {
        ipAddress: device.ip || undefined,
        networkId: device.product_id
      },
      discoveredAt: new Date(),
      confidence: device.online ? 1.0 : 0.5
    };
  }

  /**
   * Map Tuya device to DeviceInfo
   */
  private mapTuyaDeviceToInfo(device: TuyaDevice): DeviceInfo {
    return {
      deviceId: device.id,
      protocol: 'tuya',
      deviceType: this.mapTuyaCategoryToDeviceType(device.category),
      name: device.name,
      manufacturer: 'Tuya',
      model: device.product_name,
      capabilities: this.mapTuyaFunctionsToCapabilities(device.functions || []).map(cap => cap.type),
      networkInfo: {
        ipAddress: device.ip || undefined,
        networkId: device.product_id
      },
      metadata: {
        category: device.category,
        subCategory: device.sub_category,
        productId: device.product_id,
        localKey: device.local_key,
        timeZone: device.time_zone,
        createTime: device.create_time,
        updateTime: device.update_time
      }
    };
  }

  /**
   * Map Tuya device to DeviceStatusUpdate
   */
  private mapTuyaDeviceToStatus(device: TuyaDevice): DeviceStatusUpdate {
    const state: Record<string, any> = {};
    
    // Convert Tuya status array to key-value state object
    for (const status of device.status) {
      state[status.code] = status.value;
    }
    
    return {
      deviceId: device.id,
      status: device.online ? 'online' : 'offline',
      state,
      timestamp: new Date(),
      source: 'polling'
    };
  }

  /**
   * Map Tuya category to DeviceType
   */
  private mapTuyaCategoryToDeviceType(category: string): DeviceType {
    const categoryMap: Record<string, DeviceType> = {
      'cz': 'smart_plug',    // Smart plug
      'pc': 'smart_plug',    // Power strip
      'kg': 'smart_plug',    // Switch
      // Add more mappings as needed
    };
    
    return categoryMap[category] || 'smart_plug'; // Default to smart_plug
  }

  /**
   * Map Tuya functions to device capabilities
   */
  private mapTuyaFunctionsToCapabilities(functions: any[]): any[] {
    const capabilities = [];
    
    for (const func of functions) {
      switch (func.code) {
        case 'switch_1':
        case 'switch':
          capabilities.push({
            type: 'switch',
            properties: { writable: true },
            commands: ['turn_on', 'turn_off', 'toggle']
          });
          break;
          
        case 'cur_power':
        case 'power':
          capabilities.push({
            type: 'energy_meter',
            properties: { 
              writable: false,
              unit: 'W',
              range: { min: 0, max: 10000 }
            },
            commands: ['get_power']
          });
          break;
          
        // Add more capability mappings as needed
      }
    }
    
    return capabilities;
  }

  /**
   * Map command to Tuya format
   */
  private mapCommandToTuya(command: DeviceCommand): any {
    const { command: cmd, parameters } = command;
    
    switch (cmd) {
      case 'turn_on':
        return { code: 'switch_1', value: true };
        
      case 'turn_off':
        return { code: 'switch_1', value: false };
        
      case 'toggle':
        // This would need current state to determine new value
        return { code: 'switch_1', value: true }; // Simplified for now
        
      default:
        throw new Error(`Unsupported command: ${cmd}`);
    }
  }
}