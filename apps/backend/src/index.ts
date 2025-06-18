#!/usr/bin/env node

/**
 * Maestro Energy Management System - Backend Server
 * 
 * Main entry point for the Maestro backend application.
 * Initializes the Express.js server with all middleware, routes, and services.
 */

import { MaestroApp } from './app';
import logger from './config/logger';
import { config } from './config/environment';

/**
 * Main application bootstrap function
 */
async function bootstrap(): Promise<void> {
  let app: MaestroApp | undefined;

  try {
    logger.info('Starting Maestro Energy Management System Backend...');
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Node.js version: ${process.version}`);
    logger.info(`Platform: ${process.platform}`);

    // Create and initialize the application
    app = new MaestroApp();
    await app.initialize();

    logger.info('Maestro backend started successfully');
    logger.info(`Server running on http://${config.host}:${config.port}`);
    logger.info(`API documentation: http://${config.host}:${config.port}/api/docs`);

  } catch (error) {
    logger.error('Failed to start Maestro backend', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Attempt graceful shutdown if app was created
    if (app) {
      try {
        await app.shutdown();
      } catch (shutdownError) {
        logger.error('Error during shutdown', { error: shutdownError });
      }
    }

    process.exit(1);
  }

  /**
   * Graceful shutdown handlers
   */
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    if (app) {
      try {
        await app.shutdown();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    } else {
      process.exit(0);
    }
  };

  // Handle graceful shutdown
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });
    
    // Give logger time to write, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });
    
    // Give logger time to write, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle warnings
  process.on('warning', (warning) => {
    logger.warn('Node.js Warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  });
}

// Start the application
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Fatal error during bootstrap:', error);
    process.exit(1);
  });
}

export { MaestroApp };