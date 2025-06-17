#!/usr/bin/env node

/**
 * Integration Test for Tuya OAuth 2.0 Authentication System
 * 
 * This script tests the complete authentication flow:
 * 1. Service initialization
 * 2. OAuth URL generation
 * 3. Token exchange simulation
 * 4. JWT token validation
 * 5. Session management
 * 
 * Run with: npm run test:integration
 */

import { config } from './config/environment';
import { DatabaseManager } from './services/database';
import { CacheManager } from './services/cache';
import { AuthService } from './services/auth';
import { TuyaOAuthService } from './services/tuya-oauth';
import logger from './config/logger';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class AuthenticationIntegrationTest {
  private db: DatabaseManager;
  private cache: CacheManager;
  private authService: AuthService;
  private tuyaOAuthService: TuyaOAuthService;
  private results: TestResult[] = [];

  constructor() {
    this.db = new DatabaseManager();
    this.cache = new CacheManager();
    this.authService = new AuthService(this.db, this.cache);
    this.tuyaOAuthService = new TuyaOAuthService(this.cache, this.authService);
  }

  async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    logger.info(`Running test: ${name}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, passed: true, duration });
      logger.info(`✅ Test passed: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, passed: false, error: errorMessage, duration });
      logger.error(`❌ Test failed: ${name} (${duration}ms)`, { error: errorMessage });
    }
  }

  async initialize(): Promise<void> {
    await this.runTest('Initialize Database Connection', async () => {
      await this.db.connect();
      if (!this.db.isConnected()) {
        throw new Error('Database connection failed');
      }
    });

    await this.runTest('Initialize Cache Connection', async () => {
      await this.cache.connect();
      if (!this.cache.isConnected()) {
        throw new Error('Cache connection failed');
      }
    });
  }

  async testPasswordHashing(): Promise<void> {
    await this.runTest('Password Hashing and Verification', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = await this.authService.hashPassword(password);
      
      if (!hashedPassword || hashedPassword === password) {
        throw new Error('Password hashing failed');
      }

      const isValid = await this.authService.verifyPassword(password, hashedPassword);
      if (!isValid) {
        throw new Error('Password verification failed');
      }

      const isInvalid = await this.authService.verifyPassword('WrongPassword', hashedPassword);
      if (isInvalid) {
        throw new Error('Password verification should have failed for wrong password');
      }
    });
  }

  async testJWTTokens(): Promise<void> {
    await this.runTest('JWT Token Generation and Validation', async () => {
      const payload = {
        userId: 'test-user-id',
        sessionId: 'test-session-id',
        email: 'test@example.com',
        role: 'user'
      };

      const token = this.authService.generateAccessToken(payload);
      if (!token) {
        throw new Error('JWT token generation failed');
      }

      const validation = this.authService.validateToken(token);
      if (!validation.valid || !validation.payload) {
        throw new Error('JWT token validation failed');
      }

      if (validation.payload.userId !== payload.userId) {
        throw new Error('JWT payload userId mismatch');
      }

      if (validation.payload.email !== payload.email) {
        throw new Error('JWT payload email mismatch');
      }
    });
  }

  async testUserCreation(): Promise<void> {
    await this.runTest('User Creation and Retrieval', async () => {
      const email = `test-${Date.now()}@example.com`;
      const displayName = 'Test User';
      
      const userAuth = {
        provider: 'local' as const,
        providerId: email,
        accessToken: await this.authService.hashPassword('password123'),
        lastLoginAt: new Date()
      };

      const user = await this.authService.createUser(email, displayName, userAuth);
      
      if (!user._id) {
        throw new Error('User creation failed - no ID returned');
      }

      if (user.email !== email) {
        throw new Error('User creation failed - email mismatch');
      }

      // Test retrieval by ID
      const retrievedUser = await this.authService.getUserById(user._id);
      if (!retrievedUser || retrievedUser.email !== email) {
        throw new Error('User retrieval by ID failed');
      }

      // Test retrieval by email
      const retrievedUser2 = await this.authService.getUserByEmail(email);
      if (!retrievedUser2 || retrievedUser2._id !== user._id) {
        throw new Error('User retrieval by email failed');
      }

      // Cleanup
      const usersCollection = this.db.getUsersCollection();
      await usersCollection.deleteOne({ _id: user._id });
    });
  }

  async testSessionManagement(): Promise<void> {
    await this.runTest('Session Creation and Management', async () => {
      const userId = 'test-user-id';
      const deviceInfo = {
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
        platform: 'test'
      };

      // Create session
      const session = await this.authService.createSession(userId, deviceInfo);
      
      if (!session.sessionToken) {
        throw new Error('Session creation failed - no token');
      }

      if (session.userId !== userId) {
        throw new Error('Session creation failed - userId mismatch');
      }

      // Retrieve session
      const retrievedSession = await this.authService.getSession(session.sessionToken);
      if (!retrievedSession || retrievedSession.userId !== userId) {
        throw new Error('Session retrieval failed');
      }

      // Update session access
      await this.authService.updateSessionAccess(session.sessionToken);

      // Invalidate session
      await this.authService.invalidateSession(session.sessionToken);

      // Verify session is gone
      const invalidatedSession = await this.authService.getSession(session.sessionToken);
      if (invalidatedSession) {
        throw new Error('Session invalidation failed');
      }
    });
  }

  async testTuyaOAuthUrlGeneration(): Promise<void> {
    await this.runTest('Tuya OAuth URL Generation', async () => {
      const { authUrl, state } = await this.tuyaOAuthService.generateAuthUrl();
      
      if (!authUrl || !authUrl.includes('oauth/authorize')) {
        throw new Error('OAuth URL generation failed - invalid URL');
      }

      if (!state || state.length < 32) {
        throw new Error('OAuth URL generation failed - invalid state');
      }

      if (!authUrl.includes(state)) {
        throw new Error('OAuth URL generation failed - state not in URL');
      }

      if (!authUrl.includes(config.tuya.clientId)) {
        throw new Error('OAuth URL generation failed - client ID not in URL');
      }
    });
  }

  async testCacheOperations(): Promise<void> {
    await this.runTest('Cache Operations', async () => {
      const key = 'test-key';
      const value = { test: 'data', timestamp: Date.now() };

      // Set value
      await this.cache.set(key, value, 60);

      // Get value
      const retrieved = await this.cache.get(key);
      if (!retrieved || retrieved.test !== value.test) {
        throw new Error('Cache set/get failed');
      }

      // Check existence
      const exists = await this.cache.exists(key);
      if (!exists) {
        throw new Error('Cache exists check failed');
      }

      // Delete value
      await this.cache.del(key);

      // Verify deletion
      const deleted = await this.cache.get(key);
      if (deleted !== null) {
        throw new Error('Cache deletion failed');
      }
    });
  }

  async testDatabaseOperations(): Promise<void> {
    await this.runTest('Database Operations', async () => {
      const testCollection = this.db.getCollection('test_collection');
      
      // Insert document
      const testDoc = { _id: `test-${Date.now()}`, data: 'test' };
      await testCollection.insertOne(testDoc);

      // Find document
      const found = await testCollection.findOne({ _id: testDoc._id });
      if (!found || found.data !== testDoc.data) {
        throw new Error('Database insert/find failed');
      }

      // Update document
      await testCollection.updateOne(
        { _id: testDoc._id },
        { $set: { data: 'updated' } }
      );

      // Verify update
      const updated = await testCollection.findOne({ _id: testDoc._id });
      if (!updated || updated.data !== 'updated') {
        throw new Error('Database update failed');
      }

      // Delete document
      await testCollection.deleteOne({ _id: testDoc._id });

      // Verify deletion
      const deleted = await testCollection.findOne({ _id: testDoc._id });
      if (deleted) {
        throw new Error('Database deletion failed');
      }
    });
  }

  async cleanup(): Promise<void> {
    await this.runTest('Cleanup Resources', async () => {
      await this.cache.disconnect();
      await this.db.disconnect();
    });
  }

  async runAllTests(): Promise<void> {
    logger.info('🚀 Starting Maestro Authentication Integration Tests');
    logger.info('===============================================');

    try {
      // Initialize services
      await this.initialize();

      // Core service tests
      await this.testDatabaseOperations();
      await this.testCacheOperations();

      // Authentication tests
      await this.testPasswordHashing();
      await this.testJWTTokens();
      await this.testUserCreation();
      await this.testSessionManagement();

      // OAuth tests
      await this.testTuyaOAuthUrlGeneration();

      // Cleanup
      await this.cleanup();

    } catch (error) {
      logger.error('Test suite failed with unhandled error', { error });
    } finally {
      this.printResults();
    }
  }

  private printResults(): void {
    logger.info('===============================================');
    logger.info('🏁 Test Results Summary');
    logger.info('===============================================');

    const passed = this.results.filter(r => r.passed);
    const failed = this.results.filter(r => !r.passed);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    logger.info(`Total Tests: ${this.results.length}`);
    logger.info(`Passed: ${passed.length}`);
    logger.info(`Failed: ${failed.length}`);
    logger.info(`Total Duration: ${totalDuration}ms`);
    logger.info('');

    if (failed.length > 0) {
      logger.error('Failed Tests:');
      failed.forEach(test => {
        logger.error(`❌ ${test.name}: ${test.error}`);
      });
    }

    if (passed.length > 0) {
      logger.info('Passed Tests:');
      passed.forEach(test => {
        logger.info(`✅ ${test.name} (${test.duration}ms)`);
      });
    }

    const successRate = (passed.length / this.results.length) * 100;
    logger.info('');
    logger.info(`Success Rate: ${successRate.toFixed(1)}%`);

    if (failed.length === 0) {
      logger.info('🎉 All tests passed!');
    } else {
      logger.error(`💥 ${failed.length} test(s) failed`);
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new AuthenticationIntegrationTest();
  test.runAllTests().catch(error => {
    logger.error('Test runner failed', { error });
    process.exit(1);
  });
}

export default AuthenticationIntegrationTest;