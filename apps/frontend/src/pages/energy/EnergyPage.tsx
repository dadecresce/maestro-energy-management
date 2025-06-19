import { useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useDeviceStore } from '../../stores/devices';
import EnergyAnalytics from '../../components/energy/EnergyAnalytics';

const EnergyPage = () => {
  const {
    devices,
    isLoading,
    error,
    lastUpdate,
    loadDevices,
    refreshDevices,
    clearError,
  } = useDeviceStore();

  // Load devices on component mount
  useEffect(() => {
    loadDevices().catch(console.error);
  }, [loadDevices]);

  const handleRefresh = async () => {
    try {
      await refreshDevices();
    } catch (error) {
      console.error('Refresh error:', error);
    }
  };

  // Filter devices with energy monitoring capabilities
  const energyDevices = devices.filter(device => 
    device.capabilities?.some(cap => cap.type === 'energy_meter' || cap.type === 'power_monitoring') ||
    (device as any).status?.energy
  );

  const activeEnergyDevices = energyDevices.filter(device => 
    device.isOnline && (device as any).status?.energy?.activePower
  );

  if (error) {
    return (
      <Box>
        <Alert 
          severity="error" 
          action={
            <Button color="inherit" size="small" onClick={clearError}>
              Dismiss
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
            Energy Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor and analyze energy consumption across your devices
          </Typography>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Last updated: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh data">
            <IconButton onClick={handleRefresh} disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Energy settings">
            <IconButton disabled>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Quick Stats Banner */}
      {energyDevices.length > 0 && (
        <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
          <Typography variant="body2" color="primary.contrastText">
            <strong>{activeEnergyDevices.length}</strong> of <strong>{energyDevices.length}</strong> energy devices active • 
            Total consumption: <strong>
              {activeEnergyDevices.reduce((sum, d) => sum + ((d as any).status?.energy?.activePower || 0), 0).toFixed(0)} W
            </strong> • 
            Estimated daily cost: <strong>
              €{((activeEnergyDevices.reduce((sum, d) => sum + ((d as any).status?.energy?.activePower || 0), 0) / 1000) * 24 * 0.22).toFixed(2)}
            </strong>
          </Typography>
        </Box>
      )}

      {/* Main Content */}
      {energyDevices.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" gutterBottom>
            No Energy Monitoring Devices
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Your devices don't currently support energy monitoring, or no devices with energy capabilities are imported.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            To see energy analytics:
          </Typography>
          <Box component="ul" sx={{ textAlign: 'left', display: 'inline-block', color: 'text.secondary' }}>
            <li>Import smart plugs or energy meters from your Tuya account</li>
            <li>Ensure your devices have energy monitoring capabilities</li>
            <li>Turn on devices to start collecting energy data</li>
          </Box>
          <Box sx={{ mt: 3 }}>
            <Button 
              variant="contained" 
              onClick={() => window.location.href = '/devices/discovery'}
            >
              Discover Energy Devices
            </Button>
          </Box>
        </Box>
      ) : activeEnergyDevices.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" gutterBottom>
            No Active Energy Devices
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            You have {energyDevices.length} energy-capable devices, but none are currently active or online.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Turn on some devices to start seeing energy consumption data and analytics.
          </Typography>
          <Box sx={{ mt: 3 }}>
            <Button 
              variant="contained" 
              onClick={() => window.location.href = '/devices'}
            >
              Manage Devices
            </Button>
          </Box>
        </Box>
      ) : (
        <EnergyAnalytics devices={devices} />
      )}
    </Box>
  );
};

export default EnergyPage;