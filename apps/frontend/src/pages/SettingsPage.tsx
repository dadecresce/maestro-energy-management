import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  TextField,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Paper,
  Avatar,
  useTheme,
} from '@mui/material';
import {
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Notifications as NotificationsIcon,
  Language as LanguageIcon,
  AttachMoney as CurrencyIcon,
  Download as ExportIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Security as SecurityIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useAuthStore } from '../stores/auth';
import { useDeviceStore } from '../stores/devices';

const SettingsPage = () => {
  const theme = useTheme();
  const { user, logout } = useAuthStore();
  const { devices } = useDeviceStore();
  
  // Settings state
  const [settings, setSettings] = useState({
    theme: 'light' as 'light' | 'dark' | 'auto',
    notifications: true,
    language: 'en',
    currency: 'EUR',
    energyUnit: 'kWh',
    temperatureUnit: 'celsius',
    autoRefresh: true,
    refreshInterval: 30,
  });
  
  const [profileEdit, setProfileEdit] = useState({
    isEditing: false,
    displayName: user?.displayName || '',
    email: user?.email || '',
  });
  
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [deleteDataDialogOpen, setDeleteDataDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('maestro-settings');
    if (savedSettings) {
      try {
        setSettings({ ...settings, ...JSON.parse(savedSettings) });
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  }, []);

  const handleSettingChange = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Save to localStorage
    localStorage.setItem('maestro-settings', JSON.stringify(newSettings));
    
    setSuccess('Settings saved successfully');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleProfileSave = () => {
    // In a real app, this would make an API call
    setSuccess('Profile updated successfully');
    setProfileEdit({ ...profileEdit, isEditing: false });
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleExportData = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      user: {
        displayName: user?.displayName,
        email: user?.email,
      },
      devices: devices.map(d => ({
        id: d._id,
        name: d.name,
        type: d.deviceType,
        manufacturer: d.specifications.manufacturer,
        model: d.specifications.model,
        isOnline: d.isOnline,
        room: d.room,
        createdAt: d.createdAt,
      })),
      settings,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestro-data-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setExportDialogOpen(false);
    setSuccess('Data exported successfully');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDeleteData = () => {
    // Clear all local data
    localStorage.removeItem('maestro-settings');
    localStorage.removeItem('maestro-auth');
    
    setDeleteDataDialogOpen(false);
    setSuccess('Local data cleared successfully');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      setError('Failed to logout');
      setTimeout(() => setError(null), 3000);
    }
    setLogoutDialogOpen(false);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Customize your Maestro Energy Management experience
        </Typography>
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Profile Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                  <PersonIcon />
                </Avatar>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Profile Settings
                </Typography>
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Display Name
                </Typography>
                {profileEdit.isEditing ? (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      value={profileEdit.displayName}
                      onChange={(e) => setProfileEdit({ ...profileEdit, displayName: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <IconButton onClick={handleProfileSave} color="primary">
                      <SaveIcon />
                    </IconButton>
                    <IconButton onClick={() => setProfileEdit({ ...profileEdit, isEditing: false })}>
                      <CancelIcon />
                    </IconButton>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1">{user?.displayName || 'Not set'}</Typography>
                    <IconButton size="small" onClick={() => setProfileEdit({ ...profileEdit, isEditing: true })}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Email
                </Typography>
                <Typography variant="body1">{user?.email || 'Not available'}</Typography>
              </Box>

              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Account Type
                </Typography>
                <Typography variant="body1">{user?.role || 'User'}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* App Preferences */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                App Preferences
              </Typography>

              <List>
                <ListItem>
                  <ListItemIcon>
                    {settings.theme === 'dark' ? <DarkModeIcon /> : <LightModeIcon />}
                  </ListItemIcon>
                  <ListItemText primary="Theme" secondary="Choose your preferred color scheme" />
                  <ListItemSecondaryAction>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={settings.theme}
                        onChange={(e) => handleSettingChange('theme', e.target.value)}
                      >
                        <MenuItem value="light">Light</MenuItem>
                        <MenuItem value="dark">Dark</MenuItem>
                        <MenuItem value="auto">Auto</MenuItem>
                      </Select>
                    </FormControl>
                  </ListItemSecondaryAction>
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <NotificationsIcon />
                  </ListItemIcon>
                  <ListItemText primary="Notifications" secondary="Receive notifications about device status" />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.notifications}
                      onChange={(e) => handleSettingChange('notifications', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <LanguageIcon />
                  </ListItemIcon>
                  <ListItemText primary="Language" secondary="Choose your preferred language" />
                  <ListItemSecondaryAction>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={settings.language}
                        onChange={(e) => handleSettingChange('language', e.target.value)}
                      >
                        <MenuItem value="en">English</MenuItem>
                        <MenuItem value="it">Italiano</MenuItem>
                        <MenuItem value="es">Español</MenuItem>
                        <MenuItem value="fr">Français</MenuItem>
                        <MenuItem value="de">Deutsch</MenuItem>
                      </Select>
                    </FormControl>
                  </ListItemSecondaryAction>
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <CurrencyIcon />
                  </ListItemIcon>
                  <ListItemText primary="Currency" secondary="Currency for energy cost calculations" />
                  <ListItemSecondaryAction>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={settings.currency}
                        onChange={(e) => handleSettingChange('currency', e.target.value)}
                      >
                        <MenuItem value="EUR">EUR (€)</MenuItem>
                        <MenuItem value="USD">USD ($)</MenuItem>
                        <MenuItem value="GBP">GBP (£)</MenuItem>
                        <MenuItem value="JPY">JPY (¥)</MenuItem>
                      </Select>
                    </FormControl>
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Data & Privacy */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Data & Privacy
              </Typography>

              <List>
                <ListItem>
                  <ListItemIcon>
                    <ExportIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Export Data" 
                    secondary="Download all your data in JSON format" 
                  />
                  <ListItemSecondaryAction>
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={() => setExportDialogOpen(true)}
                    >
                      Export
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>

                <ListItem>
                  <ListItemIcon>
                    <DeleteIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Clear Local Data" 
                    secondary="Remove all locally stored settings and cache" 
                  />
                  <ListItemSecondaryAction>
                    <Button 
                      variant="outlined" 
                      color="error" 
                      size="small"
                      onClick={() => setDeleteDataDialogOpen(true)}
                    >
                      Clear
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* System Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                System Information
              </Typography>

              <List>
                <ListItem>
                  <ListItemText 
                    primary="Version" 
                    secondary="Maestro Energy Management v1.0.0" 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Connected Devices" 
                    secondary={`${devices.length} device${devices.length !== 1 ? 's' : ''} imported`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Online Devices" 
                    secondary={`${devices.filter(d => d.isOnline).length} device${devices.filter(d => d.isOnline).length !== 1 ? 's' : ''} online`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Last Sync" 
                    secondary={new Date().toLocaleString()}
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Button
                variant="outlined"
                color="error"
                startIcon={<LogoutIcon />}
                onClick={() => setLogoutDialogOpen(true)}
                fullWidth
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Export Data Dialog */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)}>
        <DialogTitle>Export Data</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This will download all your data including:
          </Typography>
          <Box component="ul" sx={{ mt: 1, pl: 2 }}>
            <li>Device information and settings</li>
            <li>User preferences</li>
            <li>App settings</li>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            The exported file is in JSON format and can be used for backup purposes.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleExportData} variant="contained">
            Export Data
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Data Dialog */}
      <Dialog open={deleteDataDialogOpen} onClose={() => setDeleteDataDialogOpen(false)}>
        <DialogTitle>Clear Local Data</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This will permanently delete all locally stored data including:
          </Typography>
          <Box component="ul" sx={{ mt: 1, pl: 2 }}>
            <li>App settings and preferences</li>
            <li>Cached data</li>
            <li>Local authentication tokens</li>
          </Box>
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. You may need to reconfigure your settings.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDataDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteData} color="error" variant="contained">
            Clear Data
          </Button>
        </DialogActions>
      </Dialog>

      {/* Logout Dialog */}
      <Dialog open={logoutDialogOpen} onClose={() => setLogoutDialogOpen(false)}>
        <DialogTitle>Sign Out</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to sign out of Maestro Energy Management?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleLogout} color="primary" variant="contained">
            Sign Out
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsPage;