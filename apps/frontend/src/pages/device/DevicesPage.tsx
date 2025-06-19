import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Checkbox,
  Toolbar,
  Tooltip,
  Alert,
  Skeleton,
  Fab,
  Badge,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  ViewList as ListViewIcon,
  ViewModule as GridViewIcon,
  FilterList as FilterIcon,
  PowerSettingsNew as PowerIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  CheckCircle as OnlineIcon,
  Cancel as OfflineIcon,
  Home as RoomIcon,
  Category as CategoryIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useDeviceStore } from '../../stores/devices';
import DeviceCard from '../../components/common/DeviceCard';
import type { Device } from '@maestro/shared';

type ViewMode = 'grid' | 'list';
type FilterStatus = 'all' | 'online' | 'offline' | 'active' | 'inactive';
type SortBy = 'name' | 'status' | 'type' | 'room' | 'lastUpdate';

interface DeviceFilters {
  search: string;
  status: FilterStatus;
  deviceType: string;
  room: string;
  sortBy: SortBy;
  sortOrder: 'asc' | 'desc';
}

const DevicesPage = () => {
  const navigate = useNavigate();
  const {
    devices,
    isLoading,
    error,
    totalDevices,
    loadDevices,
    refreshDevices,
    toggleDevice,
    clearError,
  } = useDeviceStore();

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  
  // Filters
  const [filters, setFilters] = useState<DeviceFilters>({
    search: '',
    status: 'all',
    deviceType: 'all',
    room: 'all',
    sortBy: 'name',
    sortOrder: 'asc',
  });

  // Load devices on mount
  useEffect(() => {
    loadDevices().catch(console.error);
  }, [loadDevices]);

  // Filter and sort devices
  const filteredDevices = useMemo(() => {
    let filtered = [...devices];
    
    // Only log if significant change to avoid spam
    const shouldLog = filtered.length !== devices.length || Math.random() < 0.1;
    if (shouldLog) {
      console.log('DevicesPage: filtering devices', { 
        totalDevices: devices.length, 
        filters,
        deviceIds: devices.map(d => d._id),
        deviceSample: devices.slice(0, 2).map(d => ({ id: d._id, name: d.name, status: d.status }))
      });
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(device => 
        device.name.toLowerCase().includes(searchLower) ||
        device.deviceType.toLowerCase().includes(searchLower) ||
        (device.room && device.room.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(device => {
        switch (filters.status) {
          case 'online': return device.isOnline;
          case 'offline': return !device.isOnline;
          case 'active': return (device as any).status?.switch === true;
          case 'inactive': return (device as any).status?.switch === false;
          default: return true;
        }
      });
    }

    // Device type filter
    if (filters.deviceType !== 'all') {
      filtered = filtered.filter(device => device.deviceType === filters.deviceType);
    }

    // Room filter
    if (filters.room !== 'all') {
      filtered = filtered.filter(device => device.room === filters.room);
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          aValue = a.isOnline ? 1 : 0;
          bValue = b.isOnline ? 1 : 0;
          break;
        case 'type':
          aValue = a.deviceType;
          bValue = b.deviceType;
          break;
        case 'room':
          aValue = a.room || '';
          bValue = b.room || '';
          break;
        case 'lastUpdate':
          aValue = new Date((a as any).updatedAt || 0).getTime();
          bValue = new Date((b as any).updatedAt || 0).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return filters.sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return filters.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    if (shouldLog) {
      console.log('DevicesPage: after filtering', { 
        filteredCount: filtered.length,
        filteredSample: filtered.slice(0, 2).map(d => ({ id: d._id, name: d.name, status: d.status }))
      });
    }

    return filtered;
  }, [devices, filters]);

  // Get unique values for filter dropdowns
  const deviceTypes = useMemo(() => {
    const types = [...new Set(devices.map(d => d.deviceType))];
    return types.sort();
  }, [devices]);

  const rooms = useMemo(() => {
    const rooms = [...new Set(devices.map(d => d.room).filter(Boolean))];
    return rooms.sort();
  }, [devices]);

  const statistics = useMemo(() => {
    const online = devices.filter(d => d.isOnline).length;
    const active = devices.filter(d => (d as any).status?.switch === true).length;
    const totalPower = devices
      .filter(d => (d as any).status?.energy?.activePower)
      .reduce((sum, d) => sum + ((d as any).status?.energy?.activePower || 0), 0);
    
    return { online, active, totalPower };
  }, [devices]);

  // Event handlers
  const handleRefresh = async () => {
    try {
      await refreshDevices();
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  const handleDeviceClick = useCallback((device: Device) => {
    navigate(`/devices/${device._id}`);
  }, [navigate]);

  const handleDeviceSelect = (deviceId: string, selected: boolean) => {
    const newSelected = new Set(selectedDevices);
    if (selected) {
      newSelected.add(deviceId);
    } else {
      newSelected.delete(deviceId);
    }
    setSelectedDevices(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedDevices.size === filteredDevices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(filteredDevices.map(d => d._id)));
    }
  };

  const handleBulkToggle = async (state: boolean) => {
    const deviceIds = Array.from(selectedDevices);
    try {
      await Promise.all(deviceIds.map(id => toggleDevice(id, state)));
      setSelectedDevices(new Set());
    } catch (error) {
      console.error('Bulk toggle failed:', error);
    }
  };

  const handleFilterChange = (key: keyof DeviceFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      deviceType: 'all',
      room: 'all',
      sortBy: 'name',
      sortOrder: 'asc',
    });
  };

  const hasActiveFilters = filters.search || filters.status !== 'all' || 
    filters.deviceType !== 'all' || filters.room !== 'all';

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
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Devices
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your {totalDevices} connected devices
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh devices">
            <span>
              <IconButton onClick={handleRefresh} disabled={isLoading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/devices/discovery')}
          >
            Discover Devices
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <OnlineIcon color="success" />
                <Box>
                  <Typography variant="h6">{statistics.online}</Typography>
                  <Typography variant="body2" color="text.secondary">Online</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PowerIcon color="primary" />
                <Box>
                  <Typography variant="h6">{statistics.active}</Typography>
                  <Typography variant="body2" color="text.secondary">Active</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CategoryIcon color="info" />
                <Box>
                  <Typography variant="h6">{deviceTypes.length}</Typography>
                  <Typography variant="body2" color="text.secondary">Types</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RoomIcon color="warning" />
                <Box>
                  <Typography variant="h6">{rooms.length || 1}</Typography>
                  <Typography variant="body2" color="text.secondary">Rooms</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Toolbar */}
      <Paper sx={{ mb: 2 }}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            {/* Search */}
            <TextField
              size="small"
              placeholder="Search devices..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: filters.search && (
                  <InputAdornment position="end">
                    <IconButton 
                      size="small" 
                      onClick={() => handleFilterChange('search', '')}
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 250 }}
            />

            {/* Filter Toggle */}
            <Tooltip title="Toggle filters">
              <IconButton 
                onClick={() => setShowFilters(!showFilters)}
                color={hasActiveFilters ? 'primary' : 'default'}
              >
                <Badge variant="dot" invisible={!hasActiveFilters}>
                  <FilterIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button size="small" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </Box>

          {/* Selection Actions */}
          {selectedDevices.size > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">
                {selectedDevices.size} selected
              </Typography>
              <Button
                size="small"
                startIcon={<PowerIcon />}
                onClick={() => handleBulkToggle(true)}
              >
                Turn On
              </Button>
              <Button
                size="small"
                startIcon={<PowerIcon />}
                onClick={() => handleBulkToggle(false)}
              >
                Turn Off
              </Button>
            </Box>
          )}

          {/* View Mode Toggle */}
          <Box sx={{ display: 'flex', ml: 'auto' }}>
            <Tooltip title="Grid view">
              <IconButton 
                onClick={() => setViewMode('grid')}
                color={viewMode === 'grid' ? 'primary' : 'default'}
              >
                <GridViewIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="List view">
              <IconButton 
                onClick={() => setViewMode('list')}
                color={viewMode === 'list' ? 'primary' : 'default'}
              >
                <ListViewIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>

        {/* Filters Panel */}
        {showFilters && (
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    <MenuItem value="all">All Devices</MenuItem>
                    <MenuItem value="online">Online</MenuItem>
                    <MenuItem value="offline">Offline</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Device Type</InputLabel>
                  <Select
                    value={filters.deviceType}
                    label="Device Type"
                    onChange={(e) => handleFilterChange('deviceType', e.target.value)}
                  >
                    <MenuItem value="all">All Types</MenuItem>
                    {deviceTypes.map(type => (
                      <MenuItem key={type} value={type}>
                        {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Room</InputLabel>
                  <Select
                    value={filters.room}
                    label="Room"
                    onChange={(e) => handleFilterChange('room', e.target.value)}
                  >
                    <MenuItem value="all">All Rooms</MenuItem>
                    {rooms.map(room => (
                      <MenuItem key={room} value={room}>{room}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={filters.sortBy}
                    label="Sort By"
                    onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  >
                    <MenuItem value="name">Name</MenuItem>
                    <MenuItem value="status">Status</MenuItem>
                    <MenuItem value="type">Type</MenuItem>
                    <MenuItem value="room">Room</MenuItem>
                    <MenuItem value="lastUpdate">Last Update</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.sortOrder === 'desc'}
                    onChange={(e) => handleFilterChange('sortOrder', e.target.checked ? 'desc' : 'asc')}
                  />
                }
                label="Descending Order"
              />
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedDevices.size === filteredDevices.length && filteredDevices.length > 0}
                    indeterminate={selectedDevices.size > 0 && selectedDevices.size < filteredDevices.length}
                    onChange={handleSelectAll}
                  />
                }
                label="Select All"
              />
            </Box>
          </Box>
        )}
      </Paper>

      {/* Device Grid/List */}
      {(() => {
        console.log('DevicesPage render:', { 
          isLoading, 
          devicesLength: devices.length, 
          filteredLength: filteredDevices.length,
          deviceIds: devices.map(d => d._id)
        });
        return null;
      })()}
      {isLoading && devices.length === 0 ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={index}>
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      ) : filteredDevices.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            {devices.length === 0 ? 'No devices found' : 'No devices match your filters'}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {devices.length === 0 
              ? 'Start by discovering devices from your Tuya account'
              : 'Try adjusting your search criteria or clearing filters'
            }
          </Typography>
          {devices.length === 0 ? (
            <Button 
              variant="contained" 
              startIcon={<AddIcon />}
              onClick={() => navigate('/devices/discovery')}
              sx={{ mt: 2 }}
            >
              Discover Devices
            </Button>
          ) : (
            <Button 
              variant="outlined" 
              onClick={clearFilters}
              sx={{ mt: 2 }}
            >
              Clear Filters
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {filteredDevices.map((device) => (
            <Grid 
              item 
              xs={12} 
              sm={viewMode === 'list' ? 12 : 6} 
              md={viewMode === 'list' ? 12 : 4} 
              lg={viewMode === 'list' ? 12 : 3} 
              key={device._id}
            >
              <Box sx={{ position: 'relative' }}>
                {/* Selection Checkbox */}
                <Checkbox
                  checked={selectedDevices.has(device._id)}
                  onChange={(e) => handleDeviceSelect(device._id, e.target.checked)}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    zIndex: 1,
                    bgcolor: 'background.paper',
                    borderRadius: '50%',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                />
                
                <DeviceCard
                  device={device}
                  onDeviceClick={handleDeviceClick}
                  showSettings={false}
                />
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Floating Action Button */}
      <Fab
        color="primary"
        aria-label="discover devices"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => navigate('/devices/discovery')}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
};

export default DevicesPage;