import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { User, AuthTokens } from '../types';
import { authService } from '../services/auth';

export interface AuthState {
  // Auth state
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (countryCode?: string) => Promise<string>; // Returns auth URL
  completeLogin: (code: string, state: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  clearError: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>()(
  subscribeWithSelector(
    (set, get) => ({
      // Initial state
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (countryCode = 'US') => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.initiateTuyaLogin(countryCode);
          
          if (response.success && response.data) {
            set({ isLoading: false });
            return response.data.authUrl;
          } else {
            throw new Error(response.message || 'Failed to initiate login');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      completeLogin: async (code: string, state: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.completeTuyaLogin(code, state);
          
          if (response.success && response.data) {
            const { user, tokens } = response.data;
            
            // Store tokens and user data
            authService.storeTokens(tokens);
            authService.storeUser(user);
            
            set({
              user,
              tokens,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(response.message || 'Failed to complete login');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login completion failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.logout();
          
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          // Even if logout fails, clear local state
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      refreshTokens: async () => {
        const { tokens } = get();
        
        if (!tokens?.refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const response = await authService.refreshTokens(tokens.refreshToken);
          
          if (response.success && response.data) {
            authService.storeTokens(response.data);
            set({ tokens: response.data });
          } else {
            throw new Error(response.message || 'Failed to refresh tokens');
          }
        } catch (error) {
          // If refresh fails, logout user
          await get().logout();
          throw error;
        }
      },

      updateProfile: async (updates: Partial<User>) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.updateProfile(updates);
          
          if (response.success && response.data) {
            const updatedUser = response.data;
            authService.storeUser(updatedUser);
            
            set({
              user: updatedUser,
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(response.message || 'Failed to update profile');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      initialize: () => {
        try {
          const authState = authService.initializeAuth();
          set(authState);
          
          // Auto-refresh token if needed
          if (authState.isAuthenticated && authState.tokens) {
            authService.autoRefreshToken().catch(console.error);
          }
        } catch (error) {
          console.error('Failed to initialize auth state:', error);
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },
    })
  )
);

// Subscribe to auth state changes for side effects
useAuthStore.subscribe(
  (state) => state.isAuthenticated,
  (isAuthenticated, previousIsAuthenticated) => {
    // Handle authentication state changes
    if (isAuthenticated && !previousIsAuthenticated) {
      console.log('User logged in');
      // Could trigger analytics, notifications, etc.
    } else if (!isAuthenticated && previousIsAuthenticated) {
      console.log('User logged out');
      // Could clear other stores, redirect, etc.
    }
  }
);

// Auto-refresh token every 30 minutes
let refreshInterval: NodeJS.Timeout | null = null;

useAuthStore.subscribe(
  (state) => state.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      // Start auto-refresh
      refreshInterval = setInterval(async () => {
        try {
          await authService.autoRefreshToken();
        } catch (error) {
          console.error('Auto-refresh failed:', error);
          // Force logout on refresh failure
          useAuthStore.getState().logout();
        }
      }, 30 * 60 * 1000); // 30 minutes
    } else {
      // Stop auto-refresh  
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }
  }
);

export default useAuthStore;