import { Application, Router } from 'express';
import { config } from '@/config/environment';
import logger from '@/config/logger';

// Import route modules
import authRoutes, { initializeAuthServices } from './auth';
import userRoutes, { initializeUserServices } from './users';
import deviceRoutes, { initializeDeviceServices } from './devices';
import healthRoutes, { initializeHealthServices } from './health';

/**
 * Initialize all route services
 */
export const initializeRouteServices = (services: {
  db: any;
  cache: any;
  authService: any;
  authMiddleware: any;
  protocolManager: any;
  wsManager: any;
  healthService: any;
  deviceService: any;
  userService: any;
}): void => {
  logger.info('Initializing route services...');
  
  // Initialize auth services
  initializeAuthServices(services.db, services.cache);
  
  // Initialize user services
  initializeUserServices(services.db, services.cache, services.authMiddleware);
  
  // Initialize device services
  initializeDeviceServices(
    services.db,
    services.cache,
    services.authMiddleware,
    services.protocolManager,
    services.wsManager
  );
  
  // Initialize health services
  initializeHealthServices(
    services.healthService,
    services.protocolManager,
    services.wsManager,
    services.cache,
    services.db,
    services.deviceService,
    services.userService
  );
  
  logger.info('Route services initialized successfully');
};

/**
 * API Routes Configuration
 * 
 * Configures all API routes with proper versioning and middleware
 */
export const setupRoutes = (app: Application): void => {
  logger.info('Setting up API routes...');

  // Create main router
  const apiRouter = Router();

  // API versioning
  const v1Router = Router();

  // Mount route modules on v1 router
  v1Router.use('/auth', authRoutes);
  v1Router.use('/users', userRoutes);
  v1Router.use('/devices', deviceRoutes);
  v1Router.use('/health', healthRoutes);

  // Mount v1 router on API router
  apiRouter.use('/v1', v1Router);

  // API root endpoint
  apiRouter.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Maestro Energy Management System API',
        version: '1.0.0',
        description: 'RESTful API for IoT energy management',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        endpoints: {
          auth: '/api/v1/auth',
          users: '/api/v1/users',
          devices: '/api/v1/devices',
          health: '/api/v1/health',
          docs: '/api/docs',
        },
        features: {
          websocket: config.websocket.enabled,
          rateLimit: {
            windowMs: config.api.rateLimit.windowMs,
            maxRequests: config.api.rateLimit.maxRequests,
          },
        },
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Setup API documentation if enabled
  if (config.development.enableSwagger) {
    setupApiDocumentation(app);
  }

  logger.info('API routes setup completed');
};

/**
 * Setup API documentation using Swagger/OpenAPI
 */
const setupApiDocumentation = (app: Application): void => {
  // TODO: Implement Swagger/OpenAPI documentation
  // This would typically use swagger-jsdoc and swagger-ui-express
  
  app.get('/api/docs', (req, res) => {
    res.json({
      message: 'API documentation not yet implemented',
      placeholder: true,
      todo: 'Implement Swagger/OpenAPI documentation',
      routes: [
        {
          path: '/api/v1/auth',
          methods: ['POST'],
          description: 'Authentication endpoints',
        },
        {
          path: '/api/v1/users',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'User management endpoints',
        },
        {
          path: '/api/v1/devices',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'Device management endpoints',
        },
        {
          path: '/api/v1/health',
          methods: ['GET'],
          description: 'System health endpoints',
        },
      ],
    });
  });
};

export { initializeRouteServices };
export default setupRoutes;