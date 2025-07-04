import { useState, memo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Switch,
  Chip,
  Avatar,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  PowerSettingsNew as PowerIcon,
  Bolt as EnergyIcon,
  WifiOff as OfflineIcon,
  Settings as SettingsIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import type { Device } from '@maestro/shared';
import { useDeviceStore } from '../../stores/devices';
import { deviceService } from '../../services/device';

interface DeviceCardProps {
  device: Device;
  onDeviceClick?: (device: Device) => void;
  onDeviceSettings?: (device: Device) => void;
  showSettings?: boolean;
}

const DeviceCard = ({ 
  device, 
  onDeviceClick, 
  onDeviceSettings,
  showSettings = true 
}: DeviceCardProps) => {
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toggleDevice } = useDeviceStore();

  // DeviceCard component for device display

  // Safety check for required properties
  if (!device || !device._id || !device.name || !device.status) {
    console.error('DeviceCard: Invalid device object:', device);
    return (
      <Card sx={{ p: 2 }}>
        <Typography color="error">Invalid device data</Typography>
      </Card>
    );
  }

  const handleToggle = async () => {
    if (!deviceService.isDeviceControllable(device)) {
      setError('Device is not controllable');
      return;
    }

    setIsToggling(true);
    setError(null);

    try {
      const newState = !device.status.switch;
      await toggleDevice(device._id, newState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle device';
      setError(errorMessage);
      console.error('Toggle device error:', error);
    } finally {
      setIsToggling(false);
    }
  };

  const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    event.stopPropagation(); // Prevent bubbling to card
    handleToggle();
  };

  const handleSettingsClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (onDeviceSettings) {
      onDeviceSettings(device);
    }
  };

  const getStatusColor = () => {
    if (!device.isOnline) return 'error';
    if (device.status.switch === true) return 'success';
    if (device.status.switch === false) return 'default';
    return 'warning';
  };

  const getStatusText = () => {
    if (!device.isOnline) return 'Offline';
    if (device.status.switch === true) return 'On';
    if (device.status.switch === false) return 'Off';
    return 'Unknown';
  };

  const formatPower = (power: number | undefined) => {
    if (power === undefined) return 'N/A';
    if (power >= 1000) return `${(power / 1000).toFixed(2)} kW`;
    return `${power.toFixed(1)} W`;
  };

  const deviceDisplayName = deviceService.getDeviceDisplayName(device);
  const isControllable = deviceService.isDeviceControllable(device);
  const currentPower = device.status.energy?.activePower;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: onDeviceClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: onDeviceClick ? 'translateY(-2px)' : 'none',
          boxShadow: (theme) => theme.shadows[8],
        },
        border: '1px solid',
        borderColor: device.isOnline ? 'transparent' : 'error.light',
      }}
      onClick={() => onDeviceClick?.(device)}
    >
      <CardContent sx={{ flexGrow: 1, p: 2 }}>
        {/* Header with Avatar and Status */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
          <Avatar
            sx={{
              backgroundColor: device.isOnline ? 'primary.main' : 'grey.400',
              mr: 2,
            }}
          >
            {device.isOnline ? <PowerIcon /> : <OfflineIcon />}
          </Avatar>
          
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              component="div"
              sx={{
                fontWeight: 600,
                fontSize: '1.1rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {deviceDisplayName}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {device.specifications.manufacturer} {device.specifications.model}
            </Typography>
            
            <Chip
              label={getStatusText()}
              color={getStatusColor()}
              size="small"
              sx={{ mt: 0.5 }}
            />
          </Box>

          {/* Settings Button */}
          {showSettings && (
            <Tooltip title="Device Settings">
              <IconButton
                onClick={handleSettingsClick}
                size="small"
                sx={{ ml: 1 }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Device Location */}
        {device.location && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            📍 {device.location}
          </Typography>
        )}

        {/* Power Information */}
        {(device.status.energy || deviceService.deviceSupportsCapability(device, 'power_monitoring')) && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <EnergyIcon color="primary" fontSize="small" />
              <Typography variant="body2" fontWeight={500}>
                Power Consumption
              </Typography>
            </Box>
            
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', mb: 1 }}>
              {formatPower(currentPower)}
            </Typography>
            
            {/* Detailed Energy Stats */}
            {device.status.energy && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
                {device.status.energy.voltage !== undefined && (
                  <Typography variant="caption" color="text.secondary">
                    Voltage: {device.status.energy.voltage.toFixed(1)}V
                  </Typography>
                )}
                {device.status.energy.current !== undefined && (
                  <Typography variant="caption" color="text.secondary">
                    Current: {device.status.energy.current.toFixed(2)}A
                  </Typography>
                )}
              </Box>
            )}
            
            {device.status.energy?.energyToday !== undefined && (
              <Typography variant="body2" color="text.secondary">
                Today: {device.status.energy.energyToday.toFixed(2)} kWh
              </Typography>
            )}
            
            {/* Energy Cost Estimate */}
            {currentPower && currentPower > 0 && (
              <Typography variant="caption" color="success.main">
                Est. Cost: €{((currentPower / 1000) * 0.22).toFixed(3)}/hr
              </Typography>
            )}
          </Box>
        )}

        {/* Toggle Switch */}
        {isControllable && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mt: 'auto',
              pt: 2,
            }}
          >
            <Typography variant="body2" fontWeight={500}>
              {device.status.switch ? 'Turn Off' : 'Turn On'}
            </Typography>
            
            <Box 
              sx={{ position: 'relative' }}
              onClick={(e) => e.stopPropagation()} // Extra protection
            >
              {isToggling && (
                <CircularProgress
                  size={24}
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    marginTop: '-12px',
                    marginLeft: '-12px',
                  }}
                />
              )}
              <Switch
                checked={device.status.switch || false}
                onChange={handleSwitchChange}
                disabled={isToggling || !device.isOnline}
                size="medium"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: 'success.main',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: 'success.main',
                  },
                }}
              />
            </Box>
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Alert 
            severity="error" 
            onClose={() => setError(null)}
            sx={{ mt: 2 }}
          >
            {error}
          </Alert>
        )}

        {/* Energy Trend Indicator (Future Phase 2) */}
        {device.energyRole === 'producer' && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 1 }}>
            <TrendingUpIcon color="success" fontSize="small" />
            <Typography variant="caption" color="success.main">
              Energy Producer
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default memo(DeviceCard);