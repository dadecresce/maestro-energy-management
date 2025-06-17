import ApiService from './api';
import { User, AuthTokens, LoginForm, ApiResponse } from '../types';

export interface TuyaAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  uid: string;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

class AuthService extends ApiService {
  /**
   * Initiate Tuya OAuth login process
   * Returns the authorization URL for user to consent
   */
  async initiateTuyaLogin(countryCode: string = 'US'): Promise<ApiResponse<{ authUrl: string }>> {
    return this.post('/auth/tuya/login', { countryCode });
  }

  /**
   * Complete Tuya OAuth login with authorization code
   */
  async completeTuyaLogin(
    authorizationCode: string,
    state: string
  ): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    return this.post('/auth/tuya/callback', {
      code: authorizationCode,
      state,
    });
  }

  /**
   * Refresh authentication tokens
   */
  async refreshTokens(refreshToken: string): Promise<ApiResponse<AuthTokens>> {
    return this.post('/auth/refresh', { refreshToken });
  }

  /**
   * Logout user and revoke tokens
   */
  async logout(): Promise<ApiResponse<void>> {
    try {
      await this.post('/auth/logout');
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear local storage regardless of API response
      this.clearLocalAuth();
    }
    return { success: true, timestamp: new Date() };
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.get('/auth/me');
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<User>): Promise<ApiResponse<User>> {
    return this.patch('/auth/profile', updates);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getStoredToken();
    return !!token && !this.isTokenExpired(token);
  }

  /**
   * Get stored authentication token
   */
  getStoredToken(): string | null {
    return localStorage.getItem('maestro-auth-token');
  }

  /**
   * Get stored refresh token
   */
  getStoredRefreshToken(): string | null {
    return localStorage.getItem('maestro-refresh-token');
  }

  /**
   * Store authentication tokens
   */
  storeTokens(tokens: AuthTokens): void {
    localStorage.setItem('maestro-auth-token', tokens.accessToken);
    localStorage.setItem('maestro-refresh-token', tokens.refreshToken);
    localStorage.setItem('maestro-token-expiry', String(Date.now() + tokens.expiresIn * 1000));
  }

  /**
   * Store user data
   */
  storeUser(user: User): void {
    localStorage.setItem('maestro-user', JSON.stringify(user));
  }

  /**
   * Get stored user data
   */
  getStoredUser(): User | null {
    const userData = localStorage.getItem('maestro-user');
    return userData ? JSON.parse(userData) : null;
  }

  /**
   * Clear all authentication data
   */
  clearLocalAuth(): void {
    localStorage.removeItem('maestro-auth-token');
    localStorage.removeItem('maestro-refresh-token');
    localStorage.removeItem('maestro-token-expiry');
    localStorage.removeItem('maestro-user');
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const expiry = localStorage.getItem('maestro-token-expiry');
      if (!expiry) return true;
      
      return Date.now() > parseInt(expiry);
    } catch (error) {
      return true;
    }
  }

  /**
   * Parse JWT token payload (without verification)
   * Only for client-side token inspection
   */
  parseTokenPayload(token: string): any {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user ID from token
   */
  getUserIdFromToken(): string | null {
    const token = this.getStoredToken();
    if (!token) return null;
    
    const payload = this.parseTokenPayload(token);
    return payload?.userId || payload?.sub || null;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    const user = this.getStoredUser();
    if (!user) return false;
    
    // For MVP, all authenticated users have full permissions
    // In future, implement role-based permissions
    return true;
  }

  /**
   * Auto-refresh token if it's about to expire
   */
  async autoRefreshToken(): Promise<boolean> {
    const token = this.getStoredToken();
    const refreshToken = this.getStoredRefreshToken();
    
    if (!token || !refreshToken) return false;
    
    const expiry = localStorage.getItem('maestro-token-expiry');
    if (!expiry) return false;
    
    // Refresh if token expires within 5 minutes
    const timeToExpiry = parseInt(expiry) - Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (timeToExpiry < fiveMinutes) {
      try {
        const response = await this.refreshTokens(refreshToken);
        if (response.success && response.data) {
          this.storeTokens(response.data);
          return true;
        }
      } catch (error) {
        console.error('Auto-refresh failed:', error);
        this.clearLocalAuth();
      }
    }
    
    return false;
  }

  /**
   * Initialize authentication state from storage
   */
  initializeAuth(): AuthState {
    const user = this.getStoredUser();
    const token = this.getStoredToken();
    const refreshToken = this.getStoredRefreshToken();
    
    if (user && token && refreshToken && !this.isTokenExpired(token)) {
      const expiry = localStorage.getItem('maestro-token-expiry');
      const expiresIn = expiry ? (parseInt(expiry) - Date.now()) / 1000 : 0;
      
      return {
        user,
        tokens: {
          accessToken: token,
          refreshToken,
          expiresIn,
          uid: user._id,
        },
        isAuthenticated: true,
        isLoading: false,
      };
    }
    
    return {
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
    };
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;