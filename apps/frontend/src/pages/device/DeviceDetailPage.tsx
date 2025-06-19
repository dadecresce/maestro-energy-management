import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  Skeleton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Avatar,
  useTheme,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  PowerSettingsNew as PowerIcon,
  Bolt as EnergyIcon,
  Schedule as ScheduleIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  WifiOff as OfflineIcon,
  TrendingUp as TrendingUpIcon,
  History as HistoryIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';
import { useDeviceStore } from '../../stores/devices';
import { deviceService } from '../../services/device';
import EnergyChart from '../../components/energy/EnergyChart';
import type { Device } from '@maestro/shared';

type TabValue = 'overview' | 'energy' | 'controls' | 'settings' | 'history';

const DeviceDetailPage = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { devices, toggleDevice, updateDevice, removeDevice } = useDeviceStore();
  
  const [currentTab, setCurrentTab] = useState<TabValue>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Find the device
  const device = devices.find(d => d._id === deviceId);

  useEffect(() => {
    if (device) {
      setEditName(device.name);
    }
  }, [device]);

  if (!device) {
    return (
      <Box>
        <Alert severity="error">
          Device not found. It may have been removed or doesn't exist.
        </Alert>
        <Button 
          startIcon={<BackIcon />} 
          onClick={() => navigate('/devices')}
          sx={{ mt: 2 }}
        >
          Back to Devices
        </Button>
      </Box>
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
      const newState = !(device as any).status?.switch;
      await toggleDevice(device._id, newState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle device';
      setError(errorMessage);
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveName = async () => {
    if (editName.trim() && editName !== device.name) {
      try {
        await updateDevice(device._id, { name: editName.trim() });
        setIsEditing(false);
      } catch (error) {
        setError('Failed to update device name');
      }
    } else {
      setIsEditing(false);
    }
  };

  const handleDeleteDevice = async () => {
    try {
      await removeDevice(device._id);
      navigate('/devices');
    } catch (error) {
      setError('Failed to remove device');
      setDeleteDialogOpen(false);
    }
  };

  const getStatusColor = () => {
    if (!device.isOnline) return 'error';
    if ((device as any).status?.switch === true) return 'success';
    if ((device as any).status?.switch === false) return 'default';
    return 'warning';
  };

  const getStatusText = () => {
    if (!device.isOnline) return 'Offline';
    if ((device as any).status?.switch === true) return 'On';
    if ((device as any).status?.switch === false) return 'Off';
    return 'Unknown';
  };

  const formatPower = (power: number | undefined) => {
    if (power === undefined) return 'N/A';
    if (power >= 1000) return `${(power / 1000).toFixed(2)} kW`;
    return `${power.toFixed(1)} W`;
  };

  const deviceDisplayName = deviceService.getDeviceDisplayName(device);
  const isControllable = deviceService.isDeviceControllable(device);
  const supportsEnergyMonitoring = deviceService.deviceSupportsCapability(device, 'power_monitoring');
  const currentPower = (device as any).status?.energy?.activePower;

  const renderOverviewTab = () => (
    <Grid container spacing={3}>
      {/* Device Status Card */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Avatar
                sx={{
                  backgroundColor: device.isOnline ? 'success.main' : 'grey.400',
                  width: 56,
                  height: 56,
                }}
              >
                {device.isOnline ? <PowerIcon /> : <OfflineIcon />}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Device Status
                </Typography>
                <Chip
                  label={getStatusText()}
                  color={getStatusColor()}
                  sx={{ mt: 1 }}
                />
              </Box>
            </Box>

            {/* Control Switch */}
            {isControllable && (
              <Box sx={{ mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={(device as any).status?.switch || false}
                      onChange={handleToggle}
                      disabled={isToggling || !device.isOnline}
                      size="medium"
                    />
                  }
                  label={(device as any).status?.switch ? 'Turn Off' : 'Turn On'}
                  sx={{ '& .MuiFormControlLabel-label': { fontWeight: 500 } }}
                />
              </Box>
            )}

            {/* Device Info */}
            <List dense>
              <ListItem disablePadding>
                <ListItemText 
                  primary="Device Type" 
                  secondary={device.deviceType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                />
              </ListItem>
              <ListItem disablePadding>
                <ListItemText 
                  primary="Protocol" 
                  secondary={device.protocol.toUpperCase()}
                />
              </ListItem>
              <ListItem disablePadding>
                <ListItemText 
                  primary="Last Seen" 
                  secondary={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}
                />
              </ListItem>
              {device.room && (
                <ListItem disablePadding>
                  <ListItemText 
                    primary="Room" 
                    secondary={device.room}
                  />
                </ListItem>
              )}
            </List>
          </CardContent>
        </Card>
      </Grid>

      {/* Energy Information */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Avatar
                sx={{
                  backgroundColor: 'primary.light',
                  color: 'primary.main',
                  width: 56,
                  height: 56,
                }}
              >
                <EnergyIcon />
              </Avatar>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Energy Monitoring
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {supportsEnergyMonitoring ? 'Active' : 'Not Available'}
                </Typography>
              </Box>
            </Box>

            {supportsEnergyMonitoring && (device as any).status?.energy ? (
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>
                  {formatPower(currentPower)}
                </Typography>
                
                <Grid container spacing={2}>
                  {(device as any).status.energy.voltage !== undefined && (
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Voltage</Typography>
                      <Typography variant="h6">{(device as any).status.energy.voltage.toFixed(1)}V</Typography>
                    </Grid>
                  )}
                  {(device as any).status.energy.current !== undefined && (
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Current</Typography>
                      <Typography variant="h6">{(device as any).status.energy.current.toFixed(2)}A</Typography>
                    </Grid>
                  )}
                </Grid>

                {currentPower && currentPower > 0 && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                    <Typography variant="body2" color="success.contrastText">
                      <strong>Estimated Cost:</strong> €{((currentPower / 1000) * 0.22).toFixed(3)}/hr
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <EnergyIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No energy monitoring data available
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Device Specifications */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Device Specifications
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell><strong>Manufacturer</strong></TableCell>
                    <TableCell>{device.specifications.manufacturer}</TableCell>
                    <TableCell><strong>Model</strong></TableCell>
                    <TableCell>{device.specifications.model}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><strong>Device ID</strong></TableCell>
                    <TableCell>{device.deviceId}</TableCell>
                    <TableCell><strong>Protocol</strong></TableCell>
                    <TableCell>{device.protocol.toUpperCase()}</TableCell>
                  </TableRow>
                  {device.specifications.maxPower && (
                    <TableRow>
                      <TableCell><strong>Max Power</strong></TableCell>
                      <TableCell>{device.specifications.maxPower}W</TableCell>
                      <TableCell><strong>Voltage</strong></TableCell>
                      <TableCell>{device.specifications.voltage || 'N/A'}V</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell><strong>Created</strong></TableCell>
                    <TableCell>{new Date(device.createdAt).toLocaleString()}</TableCell>
                    <TableCell><strong>Updated</strong></TableCell>
                    <TableCell>{new Date(device.updatedAt).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderEnergyTab = () => (
    <Box>
      {supportsEnergyMonitoring ? (
        <EnergyChart devices={[device]} chartType="area" />
      ) : (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <EnergyIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Energy Monitoring Not Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This device doesn't support energy monitoring capabilities.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );

  const renderControlsTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Device Controls
            </Typography>
            
            {isControllable ? (
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={(device as any).status?.switch || false}
                      onChange={handleToggle}
                      disabled={isToggling || !device.isOnline}
                      size="large"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {(device as any).status?.switch ? 'Device is On' : 'Device is Off'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(device as any).status?.switch ? 'Click to turn off' : 'Click to turn on'}
                      </Typography>
                    </Box>
                  }
                  sx={{ 
                    '& .MuiFormControlLabel-label': { ml: 2 },
                    mb: 3
                  }}
                />
                
                {!device.isOnline && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Device is offline and cannot be controlled.
                  </Alert>
                )}
              </Box>
            ) : (
              <Alert severity="info">
                This device doesn't support remote control.
              </Alert>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Device Capabilities
            </Typography>
            
            <List>
              {device.capabilities.map((capability, index) => (
                <ListItem key={index} disablePadding>
                  <ListItemIcon>
                    <CheckCircle color="success" />
                  </ListItemIcon>
                  <ListItemText 
                    primary={capability.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    secondary={`Commands: ${capability.commands.join(', ')}`}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderSettingsTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Device Settings
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Device Name
              </Typography>
              {isEditing ? (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <Button onClick={handleSaveName} variant="contained" size="small">
                    Save
                  </Button>
                  <Button onClick={() => setIsEditing(false)} size="small">
                    Cancel
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body1">{device.name}</Typography>
                  <IconButton size="small" onClick={() => setIsEditing(true)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Danger Zone
              </Typography>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Remove Device
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/devices')} sx={{ mr: 2 }}>
          <BackIcon />
        </IconButton>
        
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            {deviceDisplayName}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {device.specifications.manufacturer} {device.specifications.model}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton disabled>
            <RefreshIcon />
          </IconButton>
          <IconButton disabled>
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Box sx={{ mb: 3 }}>
        <Tabs 
          value={currentTab} 
          onChange={(_, newValue) => setCurrentTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Overview" value="overview" icon={<InfoIcon />} iconPosition="start" />
          <Tab label="Energy" value="energy" icon={<EnergyIcon />} iconPosition="start" />
          <Tab label="Controls" value="controls" icon={<TuneIcon />} iconPosition="start" />
          <Tab label="Settings" value="settings" icon={<SettingsIcon />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {currentTab === 'overview' && renderOverviewTab()}
      {currentTab === 'energy' && renderEnergyTab()}
      {currentTab === 'controls' && renderControlsTab()}
      {currentTab === 'settings' && renderSettingsTab()}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Remove Device</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove "{device.name}" from your account?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            This action cannot be undone. The device will need to be re-imported if you want to control it again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteDevice} color="error" variant="contained">
            Remove Device
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviceDetailPage;