import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Container,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material';
import {
  Power as PowerIcon,
  VpnKey as KeyIcon,
} from '@mui/icons-material';
import { useAuthStore } from '../../stores/auth';

const countryCodes = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
];

const LoginPage = () => {
  const [countryCode, setCountryCode] = useState('US');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const { login, completeLogin, isLoading, error, clearError } = useAuthStore();

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (code && state) {
      handleOAuthCallback(code, state);
    }
  }, [searchParams]);

  const handleOAuthCallback = async (code: string, state: string) => {
    try {
      await completeLogin(code, state);
      navigate('/dashboard');
    } catch (error) {
      console.error('OAuth callback error:', error);
    }
  };

  const handleTuyaLogin = async () => {
    clearError();
    
    try {
      const authUrl = await login(countryCode);
      
      // Redirect to Tuya OAuth
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        console.error('No auth URL received');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 3,
        }}
      >
        <Paper
          elevation={6}
          sx={{
            p: 4,
            width: '100%',
            maxWidth: 400,
            borderRadius: 3,
          }}
        >
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'primary.main',
                color: 'primary.contrastText',
                mb: 2,
              }}
            >
              <PowerIcon sx={{ fontSize: 32 }} />
            </Box>
            
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ fontWeight: 600, color: 'primary.main' }}
            >
              Maestro
            </Typography>
            
            <Typography variant="body1" color="text.secondary">
              Smart Energy Management System
            </Typography>
          </Box>

          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={clearError}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <Box component="form" onSubmit={(e) => e.preventDefault()} sx={{ mt: 2 }}>
            {/* Country Selection */}
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel id="country-label">Country</InputLabel>
              <Select
                labelId="country-label"
                value={countryCode}
                label="Country"
                onChange={(e) => setCountryCode(e.target.value)}
                disabled={isLoading}
              >
                {countryCodes.map((country) => (
                  <MenuItem key={country.code} value={country.code}>
                    {country.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Tuya Login Button */}
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleTuyaLogin}
              disabled={isLoading}
              startIcon={
                isLoading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <KeyIcon />
                )
              }
              sx={{
                py: 1.5,
                mb: 3,
                backgroundColor: 'primary.main',
                '&:hover': {
                  backgroundColor: 'primary.dark',
                },
              }}
            >
              {isLoading ? 'Connecting...' : 'Login with Tuya'}
            </Button>

            <Divider sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Secure OAuth Authentication
              </Typography>
            </Divider>

            {/* Information */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary" paragraph>
                Connect with your existing Tuya Smart account to manage your smart plugs 
                and energy devices.
              </Typography>
              
              <Typography variant="caption" color="text.secondary">
                Your credentials are never stored. We use secure OAuth 2.0 authentication 
                provided by Tuya.
              </Typography>
            </Box>
          </Box>

          {/* Features Preview */}
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
              What you can do:
            </Typography>
            
            <Box sx={{ pl: 2 }}>
              <Typography variant="body2" color="text.secondary" paragraph>
                • Control smart plugs remotely
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                • Monitor energy consumption
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                • Set schedules and automation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • Real-time device status
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default LoginPage;