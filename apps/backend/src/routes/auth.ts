import { Router, Request, Response } from 'express';
import { validateBody, validateQuery } from '@/middleware/validation';
import { userSchemas, authSchemas } from '@/middleware/validation';
import { AuthService } from '@/services/auth';
import { TuyaOAuthService } from '@/services/tuya-oauth';
import { DatabaseManager } from '@/services/database';
import { CacheManager } from '@/services/cache';
import { AuthMiddleware, createAuthRateLimit } from '@/middleware/auth';
import logger from '@/config/logger';
import { ApiError, AuthenticationError, ValidationError } from '@/utils/errors';
import Joi from 'joi';

/**
 * Authentication Routes
 * 
 * Handles user authentication, registration, and OAuth flows
 * Implements complete Tuya OAuth 2.0 integration with JWT sessions
 */
const router = Router();

// Initialize services (these would typically be injected via DI container)
let authService: AuthService;
let tuyaOAuthService: TuyaOAuthService;
let authMiddleware: AuthMiddleware;

// Service initialization function (called from app startup)
export function initializeAuthServices(
  db: DatabaseManager,
  cache: CacheManager
) {
  authService = new AuthService(db, cache);
  tuyaOAuthService = new TuyaOAuthService(cache, authService);
  authMiddleware = new AuthMiddleware(authService, cache);
}

// Rate limiting for auth endpoints
const authRateLimit = createAuthRateLimit(15 * 60 * 1000, 10); // 10 attempts per 15 minutes
const strictAuthRateLimit = createAuthRateLimit(15 * 60 * 1000, 3); // 3 attempts per 15 minutes

/**
 * POST /api/v1/auth/register
 * Register a new user account with local credentials
 * Note: Most users will register via Tuya OAuth, this is for local accounts
 */
router.post('/register', authRateLimit, validateBody(userSchemas.register), async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, timezone } = req.body;

    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Local user registration attempt', { 
      email, 
      requestId: req.requestId 
    });

    // Check if user already exists
    const existingUser = await authService.getUserByEmail(email);
    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await authService.hashPassword(password);

    // Create user auth data
    const userAuth = {
      provider: 'local' as const,
      providerId: email,
      accessToken: hashedPassword, // Store hashed password as access token for local auth
      lastLoginAt: new Date()
    };

    // Create user profile
    const profile = {
      firstName,
      lastName,
      timezone: timezone || 'UTC'
    };

    const displayName = `${firstName} ${lastName}`.trim();
    
    // Create user
    const user = await authService.createUser(email, displayName, userAuth, profile);

    // Complete authentication (create session and JWT)
    const authResult = await authService.completeAuthentication(user, {
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      platform: 'web',
      browser: req.get('User-Agent')?.split(' ')[0]
    });

    logger.info('User registered successfully', { 
      userId: user._id,
      email, 
      requestId: req.requestId 
    });

    res.status(201).json({
      success: true,
      data: authResult,
      message: 'User registered successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Registration failed', { 
      email: req.body?.email,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Registration failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/auth/login
 * Login with email and password (local accounts)
 */
router.post('/login', authRateLimit, validateBody(userSchemas.login), async (req: Request, res: Response) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Local user login attempt', { 
      email, 
      rememberMe,
      requestId: req.requestId 
    });

    // Find user by email
    const user = await authService.getUserByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Find local auth
    const localAuth = user.auth.find(auth => auth.provider === 'local');
    if (!localAuth) {
      throw new AuthenticationError('Local authentication not available for this account');
    }

    // Verify password (stored as accessToken for local auth)
    const isValidPassword = await authService.verifyPassword(password, localAuth.accessToken!);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive || user.isSuspended) {
      throw new AuthenticationError('Account is deactivated or suspended');
    }

    // Complete authentication
    const authResult = await authService.completeAuthentication(user, {
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      platform: 'web',
      browser: req.get('User-Agent')?.split(' ')[0]
    });

    logger.info('User logged in successfully', { 
      userId: user._id,
      email, 
      requestId: req.requestId 
    });

    res.json({
      success: true,
      data: authResult,
      message: 'Login successful',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Login failed', { 
      email: req.body?.email,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Login failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout and invalidate session
 */
router.post('/logout', authMiddleware?.requireAuth() || ((req, res, next) => next()), async (req: Request, res: Response) => {
  try {
    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const user = req.user;
    const sessionId = (req as any).tokenPayload?.sessionId;

    if (sessionId) {
      await authService.invalidateSession(sessionId);
    }

    logger.info('User logout', { 
      userId: user?._id,
      sessionId,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      message: 'Logout successful',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Logout failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh JWT token using refresh token
 */
router.post('/refresh', authRateLimit, validateBody(Joi.object({
  refreshToken: Joi.string().required()
})), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Token refresh attempt', { requestId: req.requestId });

    // Refresh access token
    const authResult = await authService.refreshAccessToken(refreshToken);

    logger.info('Token refreshed successfully', { 
      userId: authResult.user._id,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      data: authResult,
      message: 'Token refreshed successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Token refresh failed', { 
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Token refresh failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', validateBody(userSchemas.resetPasswordRequest), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Password reset request', { email, requestId: req.requestId });

    // Check if user exists
    const user = await authService.getUserByEmail(email);
    
    if (user) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
      
      // Store reset token with expiration in cache
      await authService['cache'].set(
        `password-reset:${resetToken}`, 
        { userId: user._id, email, expiresAt: resetTokenExpiry },
        3600 // 1 hour TTL
      );
      
      // TODO: Send reset email (email service integration)
      // await emailService.sendPasswordResetEmail(email, resetToken);
      
      logger.info('Password reset token generated', { 
        userId: user._id, 
        email,
        tokenExpiry: resetTokenExpiry,
        requestId: req.requestId 
      });
    } else {
      // Even if user doesn't exist, we log and return the same message for security
      logger.info('Password reset requested for non-existent email', { email, requestId: req.requestId });
    }

    // Always return success for security (don't reveal if email exists)
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Password reset request failed', { 
      email: req.body?.email, 
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Password reset request failed',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', validateBody(userSchemas.resetPassword), async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Password reset attempt', { tokenLength: token?.length, requestId: req.requestId });

    // Verify reset token
    const resetData = await authService['cache'].get(`password-reset:${token}`);
    if (!resetData) {
      throw new AuthenticationError('Invalid or expired reset token');
    }

    // Check token expiration
    if (new Date() > new Date(resetData.expiresAt)) {
      await authService['cache'].del(`password-reset:${token}`);
      throw new AuthenticationError('Reset token has expired');
    }

    // Get user
    const user = await authService.getUserById(resetData.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Hash new password
    const hashedPassword = await authService.hashPassword(newPassword);

    // Update user password
    const usersCollection = authService['db'].getUsersCollection();
    const updateResult = await usersCollection.updateOne(
      { 
        _id: resetData.userId,
        'auth.provider': 'local'
      },
      {
        $set: {
          'auth.$.accessToken': hashedPassword, // Store hashed password as access token for local auth
          updatedAt: new Date()
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new AuthenticationError('Unable to reset password for this account');
    }

    // Invalidate reset token
    await authService['cache'].del(`password-reset:${token}`);

    // Invalidate all user sessions for security
    await authService.invalidateAllUserSessions(resetData.userId);

    logger.info('Password reset completed successfully', { 
      userId: resetData.userId, 
      email: resetData.email,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Password reset failed', { 
      tokenLength: req.body?.token?.length,
      error: error instanceof Error ? error.message : error, 
      requestId: req.requestId 
    });
    
    if (error instanceof AuthenticationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Password reset failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * GET /api/v1/auth/tuya/login
 * Initiate Tuya OAuth flow
 */
router.get('/tuya/login', authRateLimit, validateQuery(Joi.object({
  redirect_uri: Joi.string().uri().optional()
})), async (req: Request, res: Response) => {
  try {
    if (!tuyaOAuthService) {
      throw new ApiError('Tuya OAuth service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const customRedirectUri = req.query.redirect_uri as string;
    
    logger.info('Tuya OAuth initiation', { 
      customRedirectUri,
      requestId: req.requestId 
    });

    // Generate OAuth authorization URL
    const { authUrl, state } = await tuyaOAuthService.generateAuthUrl(customRedirectUri);

    logger.info('Tuya OAuth URL generated', { 
      state,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      data: {
        authUrl,
        state,
      },
      message: 'Tuya OAuth URL generated successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Tuya OAuth initiation failed', { 
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Tuya OAuth',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/v1/auth/tuya/callback
 * Handle Tuya OAuth callback
 */
router.post('/tuya/callback', strictAuthRateLimit, validateBody(Joi.object({
  code: Joi.string().required(),
  state: Joi.string().required(),
  redirect_uri: Joi.string().uri().optional()
})), async (req: Request, res: Response) => {
  try {
    const { code, state, redirect_uri } = req.body;

    if (!tuyaOAuthService) {
      throw new ApiError('Tuya OAuth service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    logger.info('Tuya OAuth callback', { 
      state, 
      codeLength: code?.length,
      requestId: req.requestId 
    });

    // Handle OAuth callback and complete authentication
    const authResult = await tuyaOAuthService.handleCallback(code, state, redirect_uri);

    logger.info('Tuya OAuth completed successfully', { 
      userId: authResult.user._id,
      email: authResult.user.email,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      data: authResult,
      message: 'Tuya OAuth completed successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Tuya OAuth callback failed', { 
      state: req.body?.state,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Tuya OAuth callback failed',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user information (requires authentication)
 */
router.get('/me', authMiddleware?.requireAuth() || ((req, res, next) => next()), async (req: Request, res: Response) => {
  try {
    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const user = req.user;
    if (!user) {
      throw new AuthenticationError('User not found in request');
    }

    // Get full user data to check Tuya connection
    const fullUser = await authService.getUserById(user._id);
    if (!fullUser) {
      throw new AuthenticationError('User not found');
    }

    // Check if user has Tuya connection
    const tuyaAuth = fullUser.auth.find(auth => auth.provider === 'tuya');
    const tuyaConnected = !!(tuyaAuth && tuyaAuth.accessToken && 
      (!tuyaAuth.tokenExpiresAt || tuyaAuth.tokenExpiresAt > new Date()));

    // Prepare user response
    const userResponse = {
      ...user,
      tuyaConnected,
      authProviders: fullUser.auth.map(auth => ({
        provider: auth.provider,
        connected: !!(auth.accessToken && (!auth.tokenExpiresAt || auth.tokenExpiresAt > new Date())),
        lastLoginAt: auth.lastLoginAt
      }))
    };

    res.json({
      success: true,
      data: {
        user: userResponse,
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Get user info failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to get user information',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/auth/tuya/refresh
 * Refresh Tuya access token for authenticated user
 */
router.post('/tuya/refresh', authMiddleware?.requireAuth() || ((req, res, next) => next()), async (req: Request, res: Response) => {
  try {
    if (!tuyaOAuthService) {
      throw new ApiError('Tuya OAuth service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const user = req.user;
    if (!user) {
      throw new AuthenticationError('User not found in request');
    }

    logger.info('Tuya token refresh requested', { 
      userId: user._id,
      requestId: req.requestId 
    });

    // Refresh Tuya token
    await tuyaOAuthService.refreshTuyaToken(user._id);

    logger.info('Tuya token refreshed successfully', { 
      userId: user._id,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      message: 'Tuya token refreshed successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Tuya token refresh failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to refresh Tuya token',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * DELETE /api/v1/auth/tuya/disconnect
 * Disconnect Tuya account from user
 */
router.delete('/tuya/disconnect', authMiddleware?.requireAuth() || ((req, res, next) => next()), async (req: Request, res: Response) => {
  try {
    if (!tuyaOAuthService) {
      throw new ApiError('Tuya OAuth service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const user = req.user;
    if (!user) {
      throw new AuthenticationError('User not found in request');
    }

    logger.info('Tuya disconnect requested', { 
      userId: user._id,
      requestId: req.requestId 
    });

    // Revoke Tuya token and remove from user
    await tuyaOAuthService.revokeTuyaToken(user._id);

    logger.info('Tuya account disconnected successfully', { 
      userId: user._id,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      message: 'Tuya account disconnected successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Tuya disconnect failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Tuya account',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
  }
});

/**
 * POST /api/v1/auth/logout-all
 * Logout from all sessions
 */
router.post('/logout-all', authMiddleware?.requireAuth() || ((req, res, next) => next()), async (req: Request, res: Response) => {
  try {
    if (!authService) {
      throw new ApiError('Authentication service not initialized', 500, 'SERVICE_NOT_INITIALIZED');
    }

    const user = req.user;
    if (!user) {
      throw new AuthenticationError('User not found in request');
    }

    logger.info('Logout all sessions requested', { 
      userId: user._id,
      requestId: req.requestId 
    });

    // Invalidate all user sessions
    await authService.invalidateAllUserSessions(user._id);

    logger.info('All sessions logged out successfully', { 
      userId: user._id,
      requestId: req.requestId 
    });

    res.json({
      success: true,
      message: 'Logged out from all sessions successfully',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });

  } catch (error) {
    logger.error('Logout all failed', { 
      userId: req.user?._id,
      error: error instanceof Error ? error.message : error,
      requestId: req.requestId 
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to logout from all sessions',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  }
});

export default router;