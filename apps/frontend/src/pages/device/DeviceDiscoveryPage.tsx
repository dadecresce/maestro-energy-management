import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Switch,
  Snackbar,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Wifi as WifiIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useDeviceStore } from '../../stores/devices';
import { deviceService } from '../../services/device';
import type { Device } from '@maestro/shared';

interface DiscoveredDevice extends Device {
  alreadyImported: boolean;
}

const DeviceDiscoveryPage = () => {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [importDialog, setImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const { devices, loadDevices } = useDeviceStore();

  const startDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveredDevices([]);
    
    try {
      // Call real discovery API
      const response = await deviceService.discoverDevices();
      
      if (response.success && response.data) {
        // The backend returns data.discovered which contains the array of devices
        const discoveredDevicesArray = (response.data as any).discovered || [];
        
        // Check which devices are already imported
        const existingDeviceIds = new Set(devices.map(d => d.deviceId));
        const devicesWithImportStatus = discoveredDevicesArray.map((device: any) => ({
          ...device,
          alreadyImported: existingDeviceIds.has(device.deviceId),
        }));
        
        setDiscoveredDevices(devicesWithImportStatus);
        
        // Auto-select devices that aren't already imported
        const newDeviceIds = devicesWithImportStatus
          .filter(d => !d.alreadyImported && d.isOnline)
          .map(d => d.deviceId);
        setSelectedDevices(new Set(newDeviceIds));
        
        console.log('Discovery completed:', {
          total: discoveredDevicesArray.length,
          withImportStatus: devicesWithImportStatus.length,
          autoSelected: newDeviceIds.length
        });
      } else {
        throw new Error(response.message || 'Discovery failed');
      }
      
    } catch (error) {
      console.error('Discovery error:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to discover devices',
        severity: 'error',
      });
    } finally {
      setIsDiscovering(false);
      console.log('Discovery process finished, isDiscovering set to false');
    }
  };

  const toggleDeviceSelection = (deviceId: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(deviceId)) {
      newSelected.delete(deviceId);
    } else {
      newSelected.add(deviceId);
    }
    setSelectedDevices(newSelected);
  };

  const handleImportDevices = async () => {
    setIsImporting(true);
    
    try {
      const deviceIdsToImport = Array.from(selectedDevices).filter(deviceId => {
        const device = discoveredDevices.find(d => d.deviceId === deviceId);
        return device && !device.alreadyImported;
      });
      
      if (deviceIdsToImport.length === 0) {
        throw new Error('No devices selected for import');
      }
      
      // Call real import API
      const response = await deviceService.importDevices(deviceIdsToImport);
      
      if (response.success) {
        // Refresh devices list
        await loadDevices();
        
        setSnackbar({
          open: true,
          message: response.message || `Successfully imported ${deviceIdsToImport.length} devices`,
          severity: 'success',
        });
        
        setImportDialog(false);
        setSelectedDevices(new Set());
        
        // Refresh discovery to update import status
        await startDiscovery();
      } else {
        throw new Error(response.message || 'Import failed');
      }
      
    } catch (error) {
      console.error('Import error:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : 'Failed to import devices',
        severity: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const selectedCount = Array.from(selectedDevices).filter(deviceId => {
    const device = discoveredDevices.find(d => d.deviceId === deviceId);
    return device && !device.alreadyImported;
  }).length;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Device Discovery
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Discover and import devices from your Tuya Smart account
        </Typography>
      </Box>

      {/* Discovery Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Button
              variant="contained"
              startIcon={isDiscovering ? <RefreshIcon /> : <SearchIcon />}
              onClick={startDiscovery}
              disabled={isDiscovering}
              size="large"
            >
              {isDiscovering ? 'Discovering...' : 'Start Discovery'}
            </Button>
            
            {discoveredDevices.length > 0 && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setImportDialog(true)}
                disabled={selectedCount === 0}
              >
                Import Selected ({selectedCount})
              </Button>
            )}
          </Box>

          {isDiscovering && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Scanning for devices...
              </Typography>
              <LinearProgress />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Discovery Results */}
      {discoveredDevices.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Discovered Devices ({discoveredDevices.length})
            </Typography>
            
            <Grid container spacing={2}>
              {discoveredDevices.map((device) => (
                <Grid item xs={12} sm={6} md={4} key={device.deviceId}>
                  <Card 
                    variant="outlined"
                    sx={{ 
                      position: 'relative',
                      opacity: device.alreadyImported ? 0.6 : 1,
                      border: selectedDevices.has(device.deviceId) ? 2 : 1,
                      borderColor: selectedDevices.has(device.deviceId) 
                        ? 'primary.main' 
                        : 'divider',
                    }}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <WifiIcon 
                          sx={{ 
                            mr: 1, 
                            color: device.isOnline ? 'success.main' : 'error.main' 
                          }} 
                        />
                        <Typography variant="h6" sx={{ flexGrow: 1 }}>
                          {device.name}
                        </Typography>
                        {device.alreadyImported && (
                          <CheckIcon color="success" />
                        )}
                      </Box>
                      
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {device.specifications?.manufacturer || 'Unknown'} {device.specifications?.model || 'Device'}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        <Chip 
                          label={device.deviceType?.replace('_', ' ') || 'Unknown Device'} 
                          size="small" 
                          variant="outlined" 
                        />
                        <Chip 
                          label={device.isOnline ? 'Online' : 'Offline'}
                          size="small"
                          color={device.isOnline ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </Box>
                      
                      {device.alreadyImported ? (
                        <Chip 
                          label="Already Imported" 
                          color="success" 
                          size="small"
                          icon={<CheckIcon />}
                        />
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ flexGrow: 1 }}>
                            Import this device
                          </Typography>
                          <Switch
                            checked={selectedDevices.has(device.deviceId)}
                            onChange={() => toggleDeviceSelection(device.deviceId)}
                            disabled={!device.isOnline}
                          />
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Import Confirmation Dialog */}
      <Dialog open={importDialog} onClose={() => setImportDialog(false)}>
        <DialogTitle>Import Selected Devices</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            You are about to import {selectedCount} devices:
          </Typography>
          <List dense>
            {Array.from(selectedDevices).map(deviceId => {
              const device = discoveredDevices.find(d => d.deviceId === deviceId);
              if (!device || device.alreadyImported) return null;
              
              return (
                <ListItem key={deviceId}>
                  <ListItemText 
                    primary={device.name}
                    secondary={`${device.specifications?.manufacturer || 'Unknown'} ${device.specifications?.model || 'Device'}`}
                  />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialog(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleImportDevices}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Import Devices'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert 
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DeviceDiscoveryPage;