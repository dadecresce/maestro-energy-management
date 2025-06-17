import { createTheme, ThemeOptions } from '@mui/material/styles';

// Energy-focused color palette
const palette = {
  primary: {
    main: '#2E7D32',      // Green (energy/sustainability)
    light: '#4CAF50',
    dark: '#1B5E20',
    contrastText: '#ffffff'
  },
  secondary: {
    main: '#FF9800',      // Orange (solar)
    light: '#FFB74D',
    dark: '#F57C00',
    contrastText: '#000000'
  },
  success: {
    main: '#4CAF50',      // Green (device online)
    light: '#81C784',
    dark: '#388E3C'
  },
  warning: {
    main: '#FFC107',      // Yellow (warnings)
    light: '#FFD54F',
    dark: '#FFA000'
  },
  error: {
    main: '#F44336',      // Red (offline/errors)
    light: '#E57373',
    dark: '#D32F2F'
  },
  info: {
    main: '#2196F3',      // Blue (information)
    light: '#64B5F6',
    dark: '#1976D2'
  }
};

// Custom colors for energy management
const customColors = {
  solar: '#FFB74D',       // Solar production
  battery: '#81C784',     // Battery storage
  grid: '#90A4AE',        // Grid consumption
  consumption: '#E57373', // Energy consumption
  flow: '#42A5F5'         // Energy flow
};

// Light theme configuration
const lightTheme: ThemeOptions = {
  palette: {
    mode: 'light',
    ...palette,
    background: {
      default: '#fafafa',
      paper: '#ffffff'
    },
    text: {
      primary: '#212121',
      secondary: '#757575'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      color: palette.primary.main
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
      color: palette.primary.main
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 500
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5
    }
  },
  shape: {
    borderRadius: 12
  },
  spacing: 8,
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          borderRadius: 16,
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
          }
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
          padding: '8px 24px'
        },
        contained: {
          boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.2)',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
          }
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8
          }
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: palette.primary.main,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }
      }
    }
  }
};

// Dark theme configuration
const darkTheme: ThemeOptions = {
  palette: {
    mode: 'dark',
    ...palette,
    background: {
      default: '#121212',
      paper: '#1e1e1e'
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0'
    }
  },
  typography: lightTheme.typography,
  shape: lightTheme.shape,
  spacing: lightTheme.spacing,
  components: {
    ...lightTheme.components,
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e1e1e',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
          borderRadius: 16,
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
          }
        }
      }
    }
  }
};

// Export themes
export const light = createTheme(lightTheme);
export const dark = createTheme(darkTheme);

// Export custom colors for use in components
export { customColors };

// Theme type augmentation
declare module '@mui/material/styles' {
  interface Palette {
    custom: {
      solar: string;
      battery: string;
      grid: string;
      consumption: string;
      flow: string;
    };
  }

  interface PaletteOptions {
    custom?: {
      solar?: string;
      battery?: string;
      grid?: string;
      consumption?: string;
      flow?: string;
    };
  }
}

export default light;