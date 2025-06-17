import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

import { DatabaseManager } from '@/services/database';
import { CacheManager } from '@/services/cache';
import { ProtocolAdapterManager } from '@/services/protocol-adapter-manager';
import { WebSocketManager } from '@/services/websocket';
import { AuthMiddleware } from '@/middleware/auth';
import deviceRoutes, { initializeDeviceServices } from '@/routes/devices';
import authRoutes from '@/routes/auth';
import healthRoutes from '@/routes/health';
import { errorHandler } from '@/middleware/error-handler';
import { requestLogger } from '@/middleware/request-logger';

/**
 * Test Application Factory
 * 
 * Creates a fully configured Express application for testing
 * with all services initialized and ready for integration testing.
 */

export interface TestAppConfig {
  port?: number;
  enableWebSocket?: boolean;
  enableAuth?: boolean;
  logRequests?: boolean;
}

export interface TestApp {
  app: express.Application;
  server: any;
  wsManager?: WebSocketManager;
  authMiddleware: AuthMiddleware;
  cleanup: () => Promise<void>;
}

export async function createTestApp(
  dbManager: DatabaseManager,
  cache: CacheManager,
  protocolManager: ProtocolAdapterManager,
  config: TestAppConfig = {}
): Promise<TestApp> {
  const {
    port = parseInt(process.env.TEST_PORT || '3001'),
    enableWebSocket = true,
    enableAuth = true,
    logRequests = false
  } = config;

  // Create Express app
  const app = express();

  // Basic middleware
  app.use(cors({
    origin: '*',
    credentials: true
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging (optional for tests)
  if (logRequests) {
    app.use(requestLogger);
  }

  // Add request ID for testing
  app.use((req, res, next) => {
    req.requestId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    next();
  });

  // Create HTTP server
  const server = createServer(app);

  // Setup WebSocket if enabled
  let wsManager: WebSocketManager | undefined;
  if (enableWebSocket) {
    const io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      transports: ['websocket']
    });

    wsManager = new WebSocketManager(io);
    await wsManager.initialize();
  }

  // Setup authentication middleware
  const authMiddleware = new AuthMiddleware();
  
  // Mock JWT verification for tests
  if (enableAuth) {
    (authMiddleware as any).verifyToken = jest.fn().mockImplementation((token: string) => {
      // Simple test token verification
      if (token.startsWith('test-')) {
        return {
          userId: 'test-user-123',
          email: 'test@example.com'
        };
      }
      throw new Error('Invalid test token');
    });

    (authMiddleware as any).requireAuth = jest.fn().mockImplementation(() => {
      return (req: any, res: any, next: any) => {
        // Mock user for tests
        req.user = {
          _id: 'test-user-123',
          email: 'test@example.com',
          name: 'Test User'
        };
        next();
      };
    });
  }

  // Initialize device services
  initializeDeviceServices(
    dbManager,
    cache,
    authMiddleware,
    protocolManager,
    wsManager
  );

  // Setup routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/devices', deviceRoutes);
  app.use('/api/v1/health', healthRoutes);

  // Test-specific routes
  app.get('/test/ping', (req, res) => {
    res.json({ 
      message: 'pong', 
      timestamp: new Date().toISOString(),
      requestId: req.requestId 
    });
  });

  app.get('/test/services', (req, res) => {
    res.json({
      database: !!dbManager,
      cache: !!cache,
      protocolManager: !!protocolManager,
      webSocket: !!wsManager,
      timestamp: new Date().toISOString()
    });
  });

  // Error handling
  app.use(errorHandler);

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  // Start server
  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        reject(err);
      } else {
        console.log(`Test server running on port ${port}`);
        resolve();
      }
    });
  });

  // Cleanup function
  const cleanup = async (): Promise<void> => {
    if (wsManager) {
      // Close WebSocket connections
      wsManager.getIO().close();
    }
    
    // Close HTTP server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    app,
    server,
    wsManager,
    authMiddleware,
    cleanup
  };
}

/**
 * Create minimal test app for unit tests
 */
export function createMinimalTestApp(): express.Application {
  const app = express();
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mock request ID
  app.use((req, res, next) => {
    req.requestId = `test-${Date.now()}`;
    next();
  });

  return app;
}

/**
 * Wait for server to be ready
 */
export async function waitForServer(port: number, timeout = 5000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/test/ping`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Server did not start within ${timeout}ms`);
}

// Extend Express Request interface for tests
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        _id: string;
        email: string;
        name: string;
      };
    }
  }
}