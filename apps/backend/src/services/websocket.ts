import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import logger, { createModuleLogger } from '@/config/logger';
import { DeviceStatusUpdate } from '@maestro/shared/types';
import { createError } from '@/utils/errors';

/**
 * WebSocket Manager
 * 
 * Manages Socket.IO connections for real-time communication
 * with proper authentication and room management
 */
export class WebSocketManager {
  private io: SocketIOServer;
  private moduleLogger = createModuleLogger('WebSocketManager');
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private userSockets: Map<string, string> = new Map(); // socketId -> userId

  constructor(io: SocketIOServer) {
    this.io = io;
    this.moduleLogger.info('WebSocket manager initialized');
  }

  /**
   * Initialize WebSocket server with middleware and event handlers
   */
  async initialize(): Promise<void> {
    try {
      this.moduleLogger.info('Setting up WebSocket server...');

      // Authentication middleware
      this.io.use(this.authenticationMiddleware.bind(this));

      // Connection handling
      this.io.on('connection', this.handleConnection.bind(this));

      this.moduleLogger.info('WebSocket server setup completed');

    } catch (error) {
      this.moduleLogger.error('Failed to initialize WebSocket server', { error });
      throw createError.internal('WebSocket initialization failed', { originalError: error });
    }
  }

  /**
   * Authentication middleware for Socket.IO
   */
  private async authenticationMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(createError.unauthorized('Authentication token required'));
      }

      // TODO: Implement actual JWT verification
      // const decoded = jwt.verify(token, config.jwt.secret) as any;
      // socket.userId = decoded.userId;

      // Placeholder for development
      socket.userId = 'placeholder-user-id';

      this.moduleLogger.debug('WebSocket authentication successful', {
        socketId: socket.id,
        userId: socket.userId,
      });

      next();

    } catch (error) {
      this.moduleLogger.warn('WebSocket authentication failed', {
        socketId: socket.id,
        error: error instanceof Error ? error.message : error,
      });
      next(createError.unauthorized('Invalid authentication token'));
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: Socket): void {
    const userId = socket.userId;
    const socketId = socket.id;

    this.moduleLogger.info('WebSocket client connected', {
      socketId,
      userId,
      address: socket.handshake.address,
    });

    // Track user connection
    this.addUserConnection(userId, socketId);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Setup event handlers
    this.setupSocketEventHandlers(socket);

    // Send connection confirmation
    socket.emit('connected', {
      socketId,
      timestamp: new Date().toISOString(),
      message: 'Connected to Maestro WebSocket server',
    });
  }

  /**
   * Setup event handlers for a socket
   */
  private setupSocketEventHandlers(socket: Socket): void {
    const userId = socket.userId;
    const socketId = socket.id;

    // Handle device subscription
    socket.on('subscribe:device', (data: { deviceId: string }) => {
      this.handleDeviceSubscription(socket, data.deviceId);
    });

    // Handle device unsubscription
    socket.on('unsubscribe:device', (data: { deviceId: string }) => {
      this.handleDeviceUnsubscription(socket, data.deviceId);
    });

    // Handle ping/pong for connection monitoring
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // Handle client disconnect
    socket.on('disconnect', (reason) => {
      this.moduleLogger.info('WebSocket client disconnected', {
        socketId,
        userId,
        reason,
      });

      this.removeUserConnection(userId, socketId);
    });

    // Handle errors
    socket.on('error', (error) => {
      this.moduleLogger.error('WebSocket client error', {
        socketId,
        userId,
        error,
      });
    });

    // Handle custom events
    socket.on('device:command', (data: { deviceId: string; command: string; parameters?: any }) => {
      this.handleDeviceCommand(socket, data);
    });

    socket.on('device:status:request', (data: { deviceId: string }) => {
      this.handleDeviceStatusRequest(socket, data.deviceId);
    });
  }

  /**
   * Handle device subscription
   */
  private handleDeviceSubscription(socket: Socket, deviceId: string): void {
    const userId = socket.userId;
    const roomName = `device:${deviceId}`;

    // TODO: Verify user has access to this device

    socket.join(roomName);

    this.moduleLogger.debug('Device subscription', {
      socketId: socket.id,
      userId,
      deviceId,
      roomName,
    });

    socket.emit('subscribed:device', {
      deviceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle device unsubscription
   */
  private handleDeviceUnsubscription(socket: Socket, deviceId: string): void {
    const userId = socket.userId;
    const roomName = `device:${deviceId}`;

    socket.leave(roomName);

    this.moduleLogger.debug('Device unsubscription', {
      socketId: socket.id,
      userId,
      deviceId,
      roomName,
    });

    socket.emit('unsubscribed:device', {
      deviceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle device command request from WebSocket client
   */
  private handleDeviceCommand(socket: Socket, data: { deviceId: string; command: string; parameters?: any }): void {
    const userId = socket.userId;

    this.moduleLogger.info('Device command via WebSocket', {
      socketId: socket.id,
      userId,
      deviceId: data.deviceId,
      command: data.command,
    });

    // TODO: Integrate with protocol adapter manager to execute command
    // For now, just emit a placeholder response
    socket.emit('device:command:response', {
      deviceId: data.deviceId,
      command: data.command,
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Command execution not yet implemented',
    });
  }

  /**
   * Handle device status request
   */
  private handleDeviceStatusRequest(socket: Socket, deviceId: string): void {
    const userId = socket.userId;

    this.moduleLogger.debug('Device status request via WebSocket', {
      socketId: socket.id,
      userId,
      deviceId,
    });

    // TODO: Integrate with protocol adapter manager to get status
    // For now, just emit a placeholder response
    socket.emit('device:status:response', {
      deviceId,
      status: 'online',
      state: {
        power: true,
        energyConsumption: 145.6,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast device update to subscribed clients
   */
  broadcastDeviceUpdate(update: DeviceStatusUpdate): void {
    const roomName = `device:${update.deviceId}`;
    
    this.io.to(roomName).emit('device:update', {
      deviceId: update.deviceId,
      status: update.status,
      state: update.state,
      timestamp: update.timestamp,
      source: update.source,
    });

    this.moduleLogger.debug('Device update broadcasted', {
      deviceId: update.deviceId,
      roomName,
      status: update.status,
    });
  }

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId: string, notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }): void {
    const roomName = `user:${userId}`;
    
    this.io.to(roomName).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });

    this.moduleLogger.debug('Notification sent to user', {
      userId,
      type: notification.type,
      title: notification.title,
    });
  }

  /**
   * Broadcast system-wide announcement
   */
  broadcastAnnouncement(announcement: {
    type: 'info' | 'warning' | 'error';
    title: string;
    message: string;
    data?: any;
  }): void {
    this.io.emit('announcement', {
      ...announcement,
      timestamp: new Date().toISOString(),
    });

    this.moduleLogger.info('System announcement broadcasted', {
      type: announcement.type,
      title: announcement.title,
    });
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
    rooms: string[];
  } {
    const totalConnections = this.io.sockets.sockets.size;
    const uniqueUsers = this.connectedUsers.size;
    const rooms = Array.from(this.io.sockets.adapter.rooms.keys());

    return {
      totalConnections,
      uniqueUsers,
      rooms,
    };
  }

  /**
   * Get user connection info
   */
  getUserConnections(userId: string): string[] {
    return Array.from(this.connectedUsers.get(userId) || []);
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: string): boolean {
    const userSockets = this.connectedUsers.get(userId);
    return !!userSockets && userSockets.size > 0;
  }

  /**
   * Disconnect user sessions
   */
  disconnectUser(userId: string, reason?: string): void {
    const userSockets = this.connectedUsers.get(userId);
    
    if (userSockets) {
      for (const socketId of userSockets) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
      
      this.moduleLogger.info('User disconnected', {
        userId,
        socketCount: userSockets.size,
        reason,
      });
    }
  }

  /**
   * Add user connection tracking
   */
  private addUserConnection(userId: string, socketId: string): void {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    
    this.connectedUsers.get(userId)!.add(socketId);
    this.userSockets.set(socketId, userId);
  }

  /**
   * Remove user connection tracking
   */
  private removeUserConnection(userId: string, socketId: string): void {
    const userSockets = this.connectedUsers.get(userId);
    
    if (userSockets) {
      userSockets.delete(socketId);
      
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
    
    this.userSockets.delete(socketId);
  }

  /**
   * Get Socket.IO server instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Health check for WebSocket server
   */
  healthCheck(): { status: string; details: any } {
    try {
      const stats = this.getConnectionStats();
      
      return {
        status: 'healthy',
        details: {
          enabled: config.websocket.enabled,
          port: config.websocket.port,
          ...stats,
          uptime: process.uptime(),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

// Extend Socket interface to include userId
declare module 'socket.io' {
  interface Socket {
    userId: string;
  }
}

export default WebSocketManager;