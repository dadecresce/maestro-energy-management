import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { config } from '@/config/environment';
import { CacheManager } from './cache';
import { AuthService } from './auth';
import logger from '@/config/logger';
import { ApiError, AuthenticationError, ValidationError } from '@/utils/errors';
import { User, UserAuth } from '@maestro/shared/types/user';

export interface TuyaOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
  region: string;
}

export interface TuyaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  uid: string;
}

export interface TuyaUserInfo {
  uid: string;
  username: string;
  email: string;
  nick_name: string;
  avatar_url?: string;
  mobile?: string;
  country_code?: string;
  temp_unit?: number;
  time_zone_id?: string;
}

export interface TuyaAuthState {
  state: string;
  redirectUri: string;
  timestamp: number;
  nonce: string;
}

/**
 * Tuya OAuth 2.0 Service
 * 
 * Handles the complete OAuth 2.0 flow with Tuya Cloud API:
 * - Authorization URL generation
 * - Token exchange
 * - Token refresh
 * - User info retrieval
 * - State management for security
 */
export class TuyaOAuthService {
  private apiClient: AxiosInstance;
  private cache: CacheManager;
  private authService: AuthService;
  private config: TuyaOAuthConfig;

  constructor(
    cache: CacheManager,
    authService: AuthService,
    oauthConfig?: Partial<TuyaOAuthConfig>
  ) {
    this.cache = cache;
    this.authService = authService;
    
    this.config = {
      clientId: oauthConfig?.clientId || config.tuya.clientId,
      clientSecret: oauthConfig?.clientSecret || config.tuya.clientSecret,
      redirectUri: oauthConfig?.redirectUri || config.tuya.redirectUri,
      baseUrl: oauthConfig?.baseUrl || config.tuya.baseUrl,
      region: oauthConfig?.region || config.tuya.region
    };

    // Initialize axios client
    this.apiClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    // Setup response interceptor for error handling
    this.setupInterceptors();
  }

  /**
   * Generate OAuth authorization URL
   */
  async generateAuthUrl(customRedirectUri?: string): Promise<{
    authUrl: string;
    state: string;
  }> {
    try {
      // Generate secure state parameter
      const state = this.generateState();
      const nonce = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();

      const redirectUri = customRedirectUri || this.config.redirectUri;

      // Store state information for validation
      const stateData: TuyaAuthState = {
        state,
        redirectUri,
        timestamp,
        nonce
      };

      // Cache state for 10 minutes
      await this.cache.set(`tuya:oauth:state:${state}`, stateData, 600);

      // Build authorization URL
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: this.config.clientId,
        redirect_uri: redirectUri,
        state,
        scope: 'device:read device:write user.profile'
      });

      const authUrl = `${this.config.baseUrl}/oauth/authorize?${authParams.toString()}`;

      logger.info('Generated Tuya OAuth URL', { state, redirectUri });

      return { authUrl, state };
    } catch (error) {
      logger.error('Failed to generate Tuya auth URL', { error });
      throw new ApiError('Failed to generate OAuth URL', 500, 'OAUTH_URL_GENERATION_FAILED');
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(
    code: string,
    state: string,
    receivedRedirectUri?: string
  ): Promise<{
    user: Omit<User, 'auth'>;
    token: string;
    refreshToken: string;
    sessionId: string;
    expiresIn: number;
  }> {
    try {
      // Validate state parameter
      await this.validateState(state, receivedRedirectUri);

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code, receivedRedirectUri || this.config.redirectUri);

      // Get user information from Tuya
      const userInfo = await this.getTuyaUserInfo(tokenResponse.access_token);

      // Create or update user in our system
      const user = await this.createOrUpdateUser(userInfo, tokenResponse);

      // Complete authentication
      const authResult = await this.authService.completeAuthentication(user);

      logger.info('Tuya OAuth callback completed successfully', {
        userId: user._id,
        tuyaUid: userInfo.uid,
        email: userInfo.email
      });

      return authResult;
    } catch (error) {
      logger.error('Tuya OAuth callback failed', { code: code?.substring(0, 10), state, error });
      throw error;
    }
  }

  /**
   * Refresh Tuya access token
   */
  async refreshTuyaToken(userId: string): Promise<void> {
    try {
      // Get user with current auth info
      const user = await this.authService.getUserById(userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Find Tuya auth
      const tuyaAuth = user.auth.find(auth => auth.provider === 'tuya');
      if (!tuyaAuth || !tuyaAuth.refreshToken) {
        throw new AuthenticationError('No Tuya refresh token found');
      }

      // Check if token needs refreshing (refresh 5 minutes before expiry)
      if (tuyaAuth.tokenExpiresAt && tuyaAuth.tokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
        logger.debug('Tuya token still valid', { userId });
        return;
      }

      // Refresh token
      const tokenResponse = await this.refreshAccessToken(tuyaAuth.refreshToken);

      // Update user auth information
      await this.authService.updateUserAuth(userId, {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
      }, 'tuya');

      logger.info('Tuya token refreshed successfully', { userId });
    } catch (error) {
      logger.error('Failed to refresh Tuya token', { userId, error });
      throw new AuthenticationError('Failed to refresh Tuya token');
    }
  }

  /**
   * Get current Tuya access token for user
   */
  async getTuyaAccessToken(userId: string): Promise<string> {
    try {
      // Ensure token is valid/refreshed
      await this.refreshTuyaToken(userId);

      // Get user with updated auth info
      const user = await this.authService.getUserById(userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      const tuyaAuth = user.auth.find(auth => auth.provider === 'tuya');
      if (!tuyaAuth || !tuyaAuth.accessToken) {
        throw new AuthenticationError('No valid Tuya access token found');
      }

      return tuyaAuth.accessToken;
    } catch (error) {
      logger.error('Failed to get Tuya access token', { userId, error });
      throw error;
    }
  }

  /**
   * Validate OAuth state parameter
   */
  private async validateState(state: string, redirectUri?: string): Promise<void> {
    if (!state) {
      throw new ValidationError('Missing state parameter');
    }

    const stateData = await this.cache.get<TuyaAuthState>(`tuya:oauth:state:${state}`);
    if (!stateData) {
      throw new ValidationError('Invalid or expired state parameter');
    }

    // Validate timestamp (state should not be older than 10 minutes)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      throw new ValidationError('State parameter expired');
    }

    // Validate redirect URI if provided
    if (redirectUri && stateData.redirectUri !== redirectUri) {
      throw new ValidationError('Redirect URI mismatch');
    }

    // Clean up used state
    await this.cache.del(`tuya:oauth:state:${state}`);
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TuyaTokenResponse> {
    try {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');

      const requestBody = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      };

      const signature = this.createTokenSignature(requestBody, timestamp, nonce);

      const response = await this.apiClient.post('/v1.0/oauth/token', requestBody, {
        headers: {
          'client_id': this.config.clientId,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
          'nonce': nonce,
          'sign': signature
        }
      });

      if (!response.data.success) {
        throw new ApiError(`Token exchange failed: ${response.data.msg}`, 400, 'TOKEN_EXCHANGE_FAILED');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Token exchange failed', { error });
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          `Token exchange failed: ${error.response?.data?.msg || error.message}`,
          error.response?.status || 500,
          'TOKEN_EXCHANGE_FAILED'
        );
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<TuyaTokenResponse> {
    try {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');

      const requestBody = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      };

      const signature = this.createTokenSignature(requestBody, timestamp, nonce);

      const response = await this.apiClient.post('/v1.0/oauth/token', requestBody, {
        headers: {
          'client_id': this.config.clientId,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
          'nonce': nonce,
          'sign': signature
        }
      });

      if (!response.data.success) {
        throw new ApiError(`Token refresh failed: ${response.data.msg}`, 400, 'TOKEN_REFRESH_FAILED');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Token refresh failed', { error });
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          `Token refresh failed: ${error.response?.data?.msg || error.message}`,
          error.response?.status || 500,
          'TOKEN_REFRESH_FAILED'
        );
      }
      throw error;
    }
  }

  /**
   * Get user information from Tuya
   */
  private async getTuyaUserInfo(accessToken: string): Promise<TuyaUserInfo> {
    try {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');

      const signature = this.createApiSignature('GET', '/v1.0/oauth/userinfo', '', timestamp, nonce, accessToken);

      const response = await this.apiClient.get('/v1.0/oauth/userinfo', {
        headers: {
          'client_id': this.config.clientId,
          'access_token': accessToken,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
          'nonce': nonce,
          'sign': signature
        }
      });

      if (!response.data.success) {
        throw new ApiError(`Failed to get user info: ${response.data.msg}`, 400, 'USER_INFO_FAILED');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Failed to get Tuya user info', { error });
      if (axios.isAxiosError(error)) {
        throw new ApiError(
          `Failed to get user info: ${error.response?.data?.msg || error.message}`,
          error.response?.status || 500,
          'USER_INFO_FAILED'
        );
      }
      throw error;
    }
  }

  /**
   * Create or update user based on Tuya user info
   */
  private async createOrUpdateUser(userInfo: TuyaUserInfo, tokenResponse: TuyaTokenResponse): Promise<User> {
    try {
      // Check if user already exists
      let user = await this.authService.getUserByAuth('tuya', userInfo.uid);

      const tuyaAuth: UserAuth = {
        provider: 'tuya',
        providerId: userInfo.uid,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        lastLoginAt: new Date()
      };

      if (user) {
        // Update existing user
        await this.authService.updateUserAuth(user._id, tuyaAuth, 'tuya');
        
        // Get updated user
        user = await this.authService.getUserById(user._id);
        if (!user) {
          throw new ApiError('Failed to retrieve updated user', 500, 'USER_RETRIEVAL_FAILED');
        }
      } else {
        // Check if user exists with the same email
        if (userInfo.email) {
          user = await this.authService.getUserByEmail(userInfo.email);
        }

        if (user) {
          // Add Tuya auth to existing user
          const usersCollection = this.authService['db'].getUsersCollection();
          await usersCollection.updateOne(
            { _id: user._id },
            {
              $push: { auth: tuyaAuth },
              $set: { updatedAt: new Date() }
            }
          );

          // Get updated user
          user = await this.authService.getUserById(user._id);
          if (!user) {
            throw new ApiError('Failed to retrieve updated user', 500, 'USER_RETRIEVAL_FAILED');
          }
        } else {
          // Create new user
          const displayName = userInfo.nick_name || userInfo.username || 'Tuya User';
          const email = userInfo.email || `${userInfo.uid}@tuya.local`;

          const profile = {
            firstName: displayName.split(' ')[0],
            lastName: displayName.split(' ').slice(1).join(' ') || undefined,
            avatar: userInfo.avatar_url,
            timezone: this.mapTuyaTimezone(userInfo.time_zone_id),
            phoneNumber: userInfo.mobile,
            country: userInfo.country_code
          };

          user = await this.authService.createUser(email, displayName, tuyaAuth, profile);
        }
      }

      return user;
    } catch (error) {
      logger.error('Failed to create or update user', { userInfo, error });
      throw error;
    }
  }

  /**
   * Generate secure state parameter
   */
  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create signature for token requests
   */
  private createTokenSignature(requestBody: any, timestamp: string, nonce: string): string {
    const bodyString = JSON.stringify(requestBody);
    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

    const stringToSign = [
      'POST',
      bodyHash,
      '',
      '/v1.0/oauth/token'
    ].join('\n');

    const signStr = this.config.clientId + timestamp + nonce + stringToSign;

    return crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(signStr)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Create signature for API requests
   */
  private createApiSignature(
    method: string,
    url: string,
    body: string,
    timestamp: string,
    nonce: string,
    accessToken: string
  ): string {
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');

    const stringToSign = [
      method.toUpperCase(),
      bodyHash,
      '',
      url
    ].join('\n');

    const signStr = this.config.clientId + accessToken + timestamp + nonce + stringToSign;

    return crypto
      .createHmac('sha256', this.config.clientSecret)
      .update(signStr)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Map Tuya timezone to standard timezone
   */
  private mapTuyaTimezone(tuyaTimezoneId?: string): string {
    if (!tuyaTimezoneId) return 'UTC';

    // Tuya timezone mapping (simplified)
    const timezoneMap: Record<string, string> = {
      '1': 'UTC',
      '2': 'Europe/London',
      '3': 'Europe/Paris',
      '4': 'Europe/Berlin',
      '5': 'America/New_York',
      '6': 'America/Chicago',
      '7': 'America/Denver',
      '8': 'America/Los_Angeles',
      '9': 'Asia/Shanghai',
      '10': 'Asia/Tokyo',
      // Add more mappings as needed
    };

    return timezoneMap[tuyaTimezoneId] || 'UTC';
  }

  /**
   * Setup axios interceptors
   */
  private setupInterceptors(): void {
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Tuya API request failed', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Revoke Tuya access token
   */
  async revokeTuyaToken(userId: string): Promise<void> {
    try {
      const user = await this.authService.getUserById(userId);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      const tuyaAuth = user.auth.find(auth => auth.provider === 'tuya');
      if (!tuyaAuth || !tuyaAuth.accessToken) {
        logger.info('No Tuya token to revoke', { userId });
        return;
      }

      // Attempt to revoke token with Tuya
      try {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');

        const signature = this.createApiSignature(
          'POST',
          '/v1.0/oauth/revoke',
          '',
          timestamp,
          nonce,
          tuyaAuth.accessToken
        );

        await this.apiClient.post('/v1.0/oauth/revoke', {}, {
          headers: {
            'client_id': this.config.clientId,
            'access_token': tuyaAuth.accessToken,
            't': timestamp,
            'sign_method': 'HMAC-SHA256',
            'nonce': nonce,
            'sign': signature
          }
        });
      } catch (error) {
        logger.warn('Failed to revoke token with Tuya (continuing with local cleanup)', { error });
      }

      // Remove Tuya auth from user (regardless of revocation success)
      const usersCollection = this.authService['db'].getUsersCollection();
      await usersCollection.updateOne(
        { _id: userId },
        {
          $pull: { auth: { provider: 'tuya' } },
          $set: { updatedAt: new Date() }
        }
      );

      // Invalidate user cache
      await this.cache.invalidateUserCache(userId);

      logger.info('Tuya token revoked', { userId });
    } catch (error) {
      logger.error('Failed to revoke Tuya token', { userId, error });
      throw error;
    }
  }
}

export default TuyaOAuthService;