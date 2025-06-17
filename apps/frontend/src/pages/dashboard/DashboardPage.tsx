import { useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  IconButton,
  Button,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  Bolt as EnergyIcon,
  Devices as DevicesIcon,
  Power as PowerIcon,
} from '@mui/icons-material';
import { useDeviceStore } from '../../stores/devices';
import DeviceCard from '../../components/common/DeviceCard';
import { Device } from '../../types';

const DashboardPage = () => {
  const {
    devices,
    isLoading,
    error,
    totalDevices,
    lastUpdate,
    loadDevices,
    refreshDevices,
    discoverDevices,
    selectDevice,
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

  const handleDiscoverDevices = async () => {
    try {
      await discoverDevices();
    } catch (error) {
      console.error('Discovery error:', error);
    }
  };

  const handleDeviceClick = (device: Device) => {
    selectDevice(device);
    // Navigate to device detail page
    // navigate(`/devices/${device._id}`);
  };

  // Calculate dashboard statistics
  const onlineDevices = devices.filter(d => d.isOnline).length;
  const offlineDevices = devices.filter(d => !d.isOnline).length;
  const activeDevices = devices.filter(d => d.status.switch === true).length;
  const totalPowerConsumption = devices
    .filter(d => d.status.energy?.activePower)
    .reduce((sum, d) => sum + (d.status.energy?.activePower || 0), 0);

  const formatPower = (power: number) => {
    if (power >= 1000) return `${(power / 1000).toFixed(2)} kW`;
    return `${power.toFixed(1)} W`;
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
            Energy Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor and control your smart devices
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton 
            onClick={handleRefresh} 
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshIcon />
          </IconButton>
          
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleDiscoverDevices}
            disabled={isLoading}
          >
            Discover Devices
          </Button>
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert 
          severity="error" 
          onClose={clearError}
          sx={{ mb: 3 }}
        >
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: 'primary.light',
                    color: 'primary.main',
                  }}
                >
                  <DevicesIcon />
                </Box>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {totalDevices}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Devices
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: 'success.light',
                    color: 'success.main',
                  }}
                >
                  <PowerIcon />
                </Box>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {activeDevices}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Devices
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: 'warning.light',
                    color: 'warning.main',
                  }}
                >
                  <EnergyIcon />
                </Box>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {formatPower(totalPowerConsumption)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Power
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: onlineDevices === totalDevices ? 'success.light' : 'error.light',
                    color: onlineDevices === totalDevices ? 'success.main' : 'error.main',
                  }}
                >
                  <TrendingUpIcon />
                </Box>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {onlineDevices}/{totalDevices}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Online
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Devices */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 500 }}>
          Your Devices
        </Typography>
        
        {lastUpdate && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Typography>
        )}
      </Box>

      {/* Device Grid */}
      {isLoading && devices.length === 0 ? (
        <Grid container spacing={3}>
          {[...Array(6)].map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="circular" width={48} height={48} sx={{ mb: 2 }} />
                  <Skeleton variant="text" height={32} sx={{ mb: 1 }} />
                  <Skeleton variant="text" height={24} sx={{ mb: 2 }} />
                  <Skeleton variant="rectangular" height={40} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : devices.length > 0 ? (
        <Grid container spacing={3}>
          {devices.slice(0, 8).map((device) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={device._id}>
              <DeviceCard
                device={device}
                onDeviceClick={handleDeviceClick}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <DevicesIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No Devices Found
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Start by discovering your Tuya smart devices.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleDiscoverDevices}
            disabled={isLoading}
          >
            Discover Devices
          </Button>
        </Card>
      )}
    </Box>
  );
};

export default DashboardPage;