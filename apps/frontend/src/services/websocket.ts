import { io, Socket } from 'socket.io-client';
import type { WebSocketEvent, DeviceStatusUpdate } from '@maestro/shared';
import { authService } from './auth';

export type WebSocketEventType = 
  | 'device_status_update'
  | 'device_online'
  | 'device_offline'
  | 'energy_update'
  | 'alert'
  | 'command_result'
  | 'system_notification';

export interface WebSocketEventHandler {
  (event: WebSocketEvent): void;
}

export interface WebSocketConfig {
  url?: string;
  autoConnect?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

class WebSocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<WebSocketEventType, Set<WebSocketEventHandler>> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private readonly defaultConfig: WebSocketConfig = {
    url: import.meta.env.VITE_WS_URL || 'http://localhost:8000',
    autoConnect: false, // Disabled for development with simple server
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  };

  constructor(config?: WebSocketConfig) {
    const finalConfig = { ...this.defaultConfig, ...config };
    this.maxReconnectAttempts = finalConfig.reconnectionAttempts || 5;
    this.reconnectDelay = finalConfig.reconnectionDelay || 1000;

    if (finalConfig.autoConnect && authService.getStoredToken()) {
      this.connect(finalConfig.url);
    }
  }

  /**
   * Connect to WebSocket server
   */
  connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const socketUrl = url || this.defaultConfig.url!;
        const token = authService.getStoredToken();

        if (!token) {
          reject(new Error('No authentication token available'));
          return;
        }

        this.socket = io(socketUrl, {
          auth: {
            token,
          },
          transports: ['websocket', 'polling'],
          timeout: 10000,
          forceNew: true,
        });

        this.setupEventListeners();
        
        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          this.isConnected = false;
          this.handleReconnection();
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.stopHeartbeat();
    console.log('WebSocket disconnected');
  }

  /**
   * Check if WebSocket is connected
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Subscribe to specific event type
   */
  on(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from specific event type
   */
  off(eventType: WebSocketEventType, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Subscribe to device-specific events
   */
  subscribeToDevice(deviceId: string): void {
    if (this.socket) {
      this.socket.emit('subscribe_device', { deviceId });
    }
  }

  /**
   * Unsubscribe from device-specific events
   */
  unsubscribeFromDevice(deviceId: string): void {
    if (this.socket) {
      this.socket.emit('unsubscribe_device', { deviceId });
    }
  }

  /**
   * Subscribe to user-wide events
   */
  subscribeToUserEvents(): void {
    if (this.socket) {
      this.socket.emit('subscribe_user_events');
    }
  }

  /**
   * Send command via WebSocket (for immediate feedback)
   */
  sendDeviceCommand(deviceId: string, command: string, parameters?: any): void {
    if (this.socket) {
      this.socket.emit('device_command', {
        deviceId,
        command,
        parameters,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Request device status update
   */
  requestDeviceStatus(deviceId: string): void {
    if (this.socket) {
      this.socket.emit('request_device_status', { deviceId });
    }
  }

  /**
   * Setup internal event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Device status updates
    this.socket.on('device_status_update', (data: DeviceStatusUpdate) => {
      this.emitEvent('device_status_update', {
        type: 'device_status_update',
        payload: data,
        timestamp: new Date(),
        deviceId: data.deviceId,
        userId: authService.getUserIdFromToken() || '',
      });
    });

    // Device online/offline events
    this.socket.on('device_online', (data: { deviceId: string }) => {
      this.emitEvent('device_online', {
        type: 'device_online',
        payload: data,
        timestamp: new Date(),
        deviceId: data.deviceId,
        userId: authService.getUserIdFromToken() || '',
      });
    });

    this.socket.on('device_offline', (data: { deviceId: string }) => {
      this.emitEvent('device_offline', {
        type: 'device_offline',
        payload: data,
        timestamp: new Date(),
        deviceId: data.deviceId,
        userId: authService.getUserIdFromToken() || '',
      });
    });

    // Energy updates
    this.socket.on('energy_update', (data: any) => {
      this.emitEvent('energy_update', {
        type: 'energy_update',
        payload: data,
        timestamp: new Date(),
        deviceId: data.deviceId,
        userId: authService.getUserIdFromToken() || '',
      });
    });

    // System alerts
    this.socket.on('alert', (data: any) => {
      this.emitEvent('alert', {
        type: 'alert',
        payload: data,
        timestamp: new Date(),
        deviceId: data.deviceId,
        userId: authService.getUserIdFromToken() || '',
      });
    });

    // Command results
    this.socket.on('command_result', (data: any) => {
      this.emitEvent('command_result', {
        type: 'command_result',
        payload: data,
        timestamp: new Date(),
        deviceId: data.deviceId,
        userId: authService.getUserIdFromToken() || '',
      });
    });

    // Connection events
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      this.stopHeartbeat();
      
      // Attempt reconnection unless it was intentional
      if (reason !== 'io client disconnect') {
        this.handleReconnection();
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Heartbeat response
    this.socket.on('pong', () => {
      // Heartbeat acknowledged
    });
  }

  /**
   * Emit event to registered handlers
   */
  private emitEvent(eventType: WebSocketEventType, event: WebSocketEvent): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    connected: boolean;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    subscribedEvents: string[];
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      subscribedEvents: Array.from(this.eventHandlers.keys()),
    };
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;