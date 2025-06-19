import { useEffect } from 'react';
import {
  Box,
  Typography,
  Breadcrumbs,
  Link,
} from '@mui/material';
import { 
  Home as HomeIcon,
  DeviceHub as DeviceHubIcon,
} from '@mui/icons-material';
import { useDeviceStore } from '../../stores/devices';
import DeviceOrganization from '../../components/devices/DeviceOrganization';

const DeviceOrganizationPage = () => {
  const { devices, loadDevices } = useDeviceStore();

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link
          color="inherit"
          href="/dashboard"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <HomeIcon fontSize="small" />
          Dashboard
        </Link>
        <Typography color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DeviceHubIcon fontSize="small" />
          Device Organization
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Device Organization
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Organize your devices into rooms and groups for better management and control.
        </Typography>
      </Box>

      {/* Organization Component */}
      <DeviceOrganization devices={devices} />
    </Box>
  );
};

export default DeviceOrganizationPage;