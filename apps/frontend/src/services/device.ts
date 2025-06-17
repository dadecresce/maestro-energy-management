import ApiService from './api';
import { Device, DeviceCommand, CommandResult, ApiResponse, PaginatedResponse, DeviceGridFilter } from '../types';

export interface DeviceDiscoveryResult {
  devices: Device[];
  imported: number;
  skipped: number;
  errors: string[];
}

export interface DeviceControlRequest {
  deviceId: string;
  command: string;
  parameters?: Record<string, any>;
}

export interface DeviceStatusUpdate {
  deviceId: string;
  status: any;
  timestamp: Date;
}

class DeviceService extends ApiService {
  /**
   * Get all user devices with optional filtering
   */
  async getDevices(filters?: DeviceGridFilter, page = 1, limit = 50): Promise<PaginatedResponse<Device>> {
    const params = {
      page,
      limit,
      ...filters,
    };

    return this.getPaginated<Device>('/devices', params);
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(deviceId: string): Promise<ApiResponse<Device>> {
    return this.get<Device>(`/devices/${deviceId}`);
  }

  /**
   * Discover and import devices from Tuya
   */
  async discoverDevices(): Promise<ApiResponse<DeviceDiscoveryResult>> {
    return this.post<DeviceDiscoveryResult>('/devices/discover');
  }

  /**
   * Import specific devices by IDs
   */
  async importDevices(deviceIds: string[]): Promise<ApiResponse<DeviceDiscoveryResult>> {
    return this.post<DeviceDiscoveryResult>('/devices/import', { deviceIds });
  }

  /**
   * Update device information
   */
  async updateDevice(deviceId: string, updates: Partial<Device>): Promise<ApiResponse<Device>> {
    return this.patch<Device>(`/devices/${deviceId}`, updates);
  }

  /**
   * Remove device from user account
   */
  async removeDevice(deviceId: string): Promise<ApiResponse<void>> {
    return this.delete<void>(`/devices/${deviceId}`);
  }

  /**
   * Send command to device
   */
  async sendCommand(request: DeviceControlRequest): Promise<ApiResponse<CommandResult>> {
    return this.post<CommandResult>(`/devices/${request.deviceId}/commands`, {
      command: request.command,
      parameters: request.parameters,
    });
  }

  /**
   * Get device status (cached or fresh)
   */
  async getDeviceStatus(deviceId: string, fresh = false): Promise<ApiResponse<any>> {
    const params = fresh ? { fresh: 'true' } : {};
    return this.get<any>(`/devices/${deviceId}/status`, { params });
  }

  /**
   * Get device energy data/telemetry
   */
  async getDeviceTelemetry(
    deviceId: string,
    timeRange: '24h' | '7d' | '30d' | '1y' = '24h'
  ): Promise<ApiResponse<any[]>> {
    return this.get<any[]>(`/devices/${deviceId}/telemetry`, {
      params: { timeRange },
    });
  }

  /**
   * Get device command history
   */
  async getDeviceHistory(
    deviceId: string,
    page = 1,
    limit = 50
  ): Promise<PaginatedResponse<DeviceCommand>> {
    return this.getPaginated<DeviceCommand>(`/devices/${deviceId}/history`, {
      page,
      limit,
    });
  }

  /**
   * Batch device operations
   */
  async batchDeviceCommand(
    deviceIds: string[],
    command: string,
    parameters?: Record<string, any>
  ): Promise<ApiResponse<CommandResult[]>> {
    return this.post<CommandResult[]>('/devices/batch-command', {
      deviceIds,
      command,
      parameters,
    });
  }

  /**
   * Toggle device on/off (convenience method)
   */
  async toggleDevice(deviceId: string, state: boolean): Promise<ApiResponse<CommandResult>> {
    return this.sendCommand({
      deviceId,
      command: 'switch',
      parameters: { value: state },
    });
  }

  /**
   * Get device statistics
   */
  async getDeviceStats(deviceId: string, period: 'day' | 'week' | 'month' = 'day'): Promise<ApiResponse<any>> {
    return this.get<any>(`/devices/${deviceId}/stats`, {
      params: { period },
    });
  }

  /**
   * Search devices by name or location
   */
  async searchDevices(query: string): Promise<ApiResponse<Device[]>> {
    return this.get<Device[]>('/devices/search', {
      params: { q: query },
    });
  }

  /**
   * Get device capabilities
   */
  async getDeviceCapabilities(deviceId: string): Promise<ApiResponse<any>> {
    return this.get<any>(`/devices/${deviceId}/capabilities`);
  }

  /**
   * Update device settings
   */
  async updateDeviceSettings(
    deviceId: string,
    settings: Record<string, any>
  ): Promise<ApiResponse<Device>> {
    return this.patch<Device>(`/devices/${deviceId}/settings`, settings);
  }

  /**
   * Get device alerts/notifications
   */
  async getDeviceAlerts(deviceId: string): Promise<ApiResponse<any[]>> {
    return this.get<any[]>(`/devices/${deviceId}/alerts`);
  }

  /**
   * Test device connectivity
   */
  async testDevice(deviceId: string): Promise<ApiResponse<{ online: boolean; latency: number }>> {
    return this.post<{ online: boolean; latency: number }>(`/devices/${deviceId}/test`);
  }

  // Utility methods for device operations

  /**
   * Check if device supports a specific capability
   */
  deviceSupportsCapability(device: Device, capability: string): boolean {
    return device.capabilities.some(cap => cap.type === capability);
  }

  /**
   * Get device display name
   */
  getDeviceDisplayName(device: Device): string {
    return device.name || `${device.specifications.manufacturer} ${device.specifications.model}`;
  }

  /**
   * Check if device is controllable
   */
  isDeviceControllable(device: Device): boolean {
    return device.isOnline && this.deviceSupportsCapability(device, 'switch');
  }

  /**
   * Get device energy role for Phase 2
   */
  getDeviceEnergyRole(device: Device): 'consumer' | 'producer' | 'storage' | 'bidirectional' | 'unknown' {
    return device.energyRole || 'unknown';
  }

  /**
   * Format device power consumption
   */
  formatDevicePower(power: number | undefined): string {
    if (power === undefined) return 'N/A';
    
    if (power >= 1000) {
      return `${(power / 1000).toFixed(2)} kW`;
    }
    return `${power.toFixed(1)} W`;
  }

  /**
   * Get device status color for UI
   */
  getDeviceStatusColor(device: Device): 'success' | 'warning' | 'error' | 'disabled' {
    if (!device.isOnline) return 'error';
    if (device.status.switch === true) return 'success';
    if (device.status.switch === false) return 'disabled';
    return 'warning';
  }

  /**
   * Calculate device uptime percentage
   */
  calculateDeviceUptime(device: Device, periodDays = 30): number {
    // This would need historical data from the backend
    // For now, return a mock value based on online status
    return device.isOnline ? 99.5 : 85.0;
  }
}

// Export singleton instance
export const deviceService = new DeviceService();
export default deviceService;