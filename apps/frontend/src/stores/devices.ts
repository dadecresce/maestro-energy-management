import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Device, DeviceGridFilter, CommandResult, WebSocketEvent } from '@maestro/shared';
import { deviceService } from '../services/device';
import { websocketService } from '../services/websocket';

export interface DeviceState {
  // Device data
  devices: Device[];
  selectedDevice: Device | null;
  filters: DeviceGridFilter;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Pagination
  currentPage: number;
  totalPages: number;
  totalDevices: number;
  
  // Real-time updates
  lastUpdate: Date | null;
  
  // Actions
  loadDevices: (page?: number, limit?: number) => Promise<void>;
  refreshDevices: () => Promise<void>;
  discoverDevices: () => Promise<void>;
  selectDevice: (device: Device | null) => void;
  updateFilters: (filters: Partial<DeviceGridFilter>) => void;
  updateDevice: (deviceId: string, updates: Partial<Device>) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
  sendCommand: (deviceId: string, command: string, parameters?: any) => Promise<CommandResult>;
  toggleDevice: (deviceId: string, state: boolean) => Promise<CommandResult>;
  clearError: () => void;
  
  // Real-time event handlers
  handleDeviceStatusUpdate: (event: WebSocketEvent) => void;
  handleDeviceOnline: (event: WebSocketEvent) => void;
  handleDeviceOffline: (event: WebSocketEvent) => void;
}

export const useDeviceStore = create<DeviceState>()(
  subscribeWithSelector(
    (set, get) => ({
      // Initial state
      devices: [],
      selectedDevice: null,
      filters: { status: 'all' },
      isLoading: false,
      error: null,
      currentPage: 1,
      totalPages: 1,
      totalDevices: 0,
      lastUpdate: null,

      // Actions
      loadDevices: async (page = 1, limit = 50) => {
        set({ isLoading: true, error: null });
        
        try {
          const { filters } = get();
          const response = await deviceService.getDevices(filters, page, limit);
          
          if (response.success && response.data) {
            set({
              devices: response.data,
              currentPage: response.pagination?.page || page,
              totalPages: response.pagination?.totalPages || 1,
              totalDevices: response.pagination?.total || response.data.length,
              isLoading: false,
              lastUpdate: new Date(),
            });
          } else {
            throw new Error(response.message || 'Failed to load devices');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load devices';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      refreshDevices: async () => {
        const { currentPage } = get();
        await get().loadDevices(currentPage);
      },

      discoverDevices: async () => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await deviceService.discoverDevices();
          
          if (response.success && response.data) {
            // Refresh device list after discovery
            await get().refreshDevices();
            
            set({
              isLoading: false,
              lastUpdate: new Date(),
            });
            
            return response.data;
          } else {
            throw new Error(response.message || 'Failed to discover devices');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Device discovery failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      selectDevice: (device: Device | null) => {
        set({ selectedDevice: device });
        
        // Subscribe to device updates if selected
        if (device) {
          websocketService.subscribeToDevice(device._id);
        }
      },

      updateFilters: (newFilters: Partial<DeviceGridFilter>) => {
        const currentFilters = get().filters;
        const updatedFilters = { ...currentFilters, ...newFilters };
        
        set({ filters: updatedFilters });
        
        // Reload devices with new filters
        get().loadDevices(1).catch(console.error);
      },

      updateDevice: async (deviceId: string, updates: Partial<Device>) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await deviceService.updateDevice(deviceId, updates);
          
          if (response.success && response.data) {
            const updatedDevice = response.data;
            
            set((state) => ({
              devices: state.devices.map(device => 
                device._id === deviceId ? updatedDevice : device
              ),
              selectedDevice: state.selectedDevice?._id === deviceId 
                ? updatedDevice 
                : state.selectedDevice,
              isLoading: false,
              lastUpdate: new Date(),
            }));
          } else {
            throw new Error(response.message || 'Failed to update device');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Device update failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      removeDevice: async (deviceId: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await deviceService.removeDevice(deviceId);
          
          if (response.success) {
            set((state) => ({
              devices: state.devices.filter(device => device._id !== deviceId),
              selectedDevice: state.selectedDevice?._id === deviceId 
                ? null 
                : state.selectedDevice,
              totalDevices: state.totalDevices - 1,
              isLoading: false,
              lastUpdate: new Date(),
            }));
            
            // Unsubscribe from device updates
            websocketService.unsubscribeFromDevice(deviceId);
          } else {
            throw new Error(response.message || 'Failed to remove device');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Device removal failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      sendCommand: async (deviceId: string, command: string, parameters?: any) => {
        try {
          // Send command via HTTP API
          const response = await deviceService.sendCommand({
            deviceId,
            command,
            parameters,
          });
          
          if (response.success && response.data) {
            return response.data;
          } else {
            throw new Error(response.message || 'Command failed');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Command execution failed';
          set({ error: errorMessage });
          throw error;
        }
      },

      toggleDevice: async (deviceId: string, state: boolean) => {
        console.log('toggleDevice called:', { deviceId, state });
        
        try {
          // Send command to backend first (remove optimistic update)
          const result = await get().sendCommand(deviceId, 'switch', { value: state });
          
          console.log('Toggle device result:', result);
          
          // Update state only once with the result
          if (result?.result) {
            set((currentState) => ({
              devices: currentState.devices.map(device => 
                device._id === deviceId 
                  ? { 
                      ...device, 
                      status: { 
                        ...device.status, 
                        switch: result.result.switch,
                        energy: result.result.energy || device.status.energy
                      },
                      updatedAt: new Date().toISOString()
                    }
                  : device
              ),
              selectedDevice: currentState.selectedDevice?._id === deviceId
                ? { 
                    ...currentState.selectedDevice, 
                    status: { 
                      ...currentState.selectedDevice.status, 
                      switch: result.result.switch,
                      energy: result.result.energy || currentState.selectedDevice.status.energy
                    },
                    updatedAt: new Date().toISOString()
                  }
                : currentState.selectedDevice,
              lastUpdate: new Date(),
            }));
          }
          
          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to toggle device';
          set({ error: errorMessage });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      // Real-time event handlers
      handleDeviceStatusUpdate: (event: WebSocketEvent) => {
        const { deviceId, payload } = event;
        
        if (!deviceId) return;
        
        set((state) => ({
          devices: state.devices.map(device => {
            if (device._id === deviceId) {
              return {
                ...device,
                status: { ...device.status, ...payload.status },
                lastSeenAt: new Date(payload.timestamp),
              };
            }
            return device;
          }),
          selectedDevice: state.selectedDevice?._id === deviceId
            ? {
                ...state.selectedDevice,
                status: { ...state.selectedDevice.status, ...payload.status },
                lastSeenAt: new Date(payload.timestamp),
              }
            : state.selectedDevice,
          lastUpdate: new Date(),
        }));
      },

      handleDeviceOnline: (event: WebSocketEvent) => {
        const { deviceId } = event;
        
        if (!deviceId) return;
        
        set((state) => ({
          devices: state.devices.map(device => {
            if (device._id === deviceId) {
              return {
                ...device,
                isOnline: true,
                lastSeenAt: new Date(),
              };
            }
            return device;
          }),
          selectedDevice: state.selectedDevice?._id === deviceId
            ? {
                ...state.selectedDevice,
                isOnline: true,
                lastSeenAt: new Date(),
              }
            : state.selectedDevice,
          lastUpdate: new Date(),
        }));
      },

      handleDeviceOffline: (event: WebSocketEvent) => {
        const { deviceId } = event;
        
        if (!deviceId) return;
        
        set((state) => ({
          devices: state.devices.map(device => {
            if (device._id === deviceId) {
              return {
                ...device,
                isOnline: false,
                lastSeenAt: new Date(),
              };
            }
            return device;
          }),
          selectedDevice: state.selectedDevice?._id === deviceId
            ? {
                ...state.selectedDevice,
                isOnline: false,
                lastSeenAt: new Date(),
              }
            : state.selectedDevice,
          lastUpdate: new Date(),
        }));
      },
    })
  )
);

// Setup WebSocket event listeners
websocketService.on('device_status_update', useDeviceStore.getState().handleDeviceStatusUpdate);
websocketService.on('device_online', useDeviceStore.getState().handleDeviceOnline);
websocketService.on('device_offline', useDeviceStore.getState().handleDeviceOffline);

// Subscribe to auth changes to connect/disconnect WebSocket
import { useAuthStore } from './auth';

useAuthStore.subscribe(
  (state) => state.isAuthenticated,
  (isAuthenticated) => {
    if (isAuthenticated) {
      // WebSocket disabled for development with simple server
      // Uncomment when using full backend with WebSocket support
      /*
      websocketService.connect().then(() => {
        websocketService.subscribeToUserEvents();
      }).catch(console.error);
      */
    } else {
      // Disconnect WebSocket
      websocketService.disconnect();
      
      // Clear device data
      useDeviceStore.setState({
        devices: [],
        selectedDevice: null,
        totalDevices: 0,
        currentPage: 1,
        totalPages: 1,
        lastUpdate: null,
      });
    }
  }
);

export default useDeviceStore;