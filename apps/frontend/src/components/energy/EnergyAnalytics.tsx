import { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Tabs,
  Tab,
  Button,
  ButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Bolt as EnergyIcon,
  Euro as EuroIcon,
  CalendarToday as CalendarIcon,
  GetApp as ExportIcon,
  PieChart as PieChartIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import type { Device } from '@maestro/shared';
import EnergyChart from './EnergyChart';

interface EnergyAnalyticsProps {
  devices: Device[];
}

type TimeRange = '24h' | '7d' | '30d';
type ViewType = 'overview' | 'consumption' | 'costs' | 'devices';

const EnergyAnalytics = ({ devices }: EnergyAnalyticsProps) => {
  const theme = useTheme();
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [chartType, setChartType] = useState<'line' | 'area'>('area');

  // Filter active devices
  const activeDevices = devices.filter(d => d.status?.energy?.activePower && d.isOnline);
  
  // Calculate statistics
  const statistics = useMemo(() => {
    const totalPower = activeDevices.reduce((sum, d) => sum + ((d as any).status?.energy?.activePower || 0), 0);
    const activeCount = activeDevices.filter(d => (d as any).status?.switch === true).length;
    const offlineCount = devices.filter(d => !d.isOnline).length;
    
    // Energy cost calculation (mock rates)
    const hourlyRate = 0.22; // €0.22 per kWh
    const dailyCost = (totalPower / 1000) * 24 * hourlyRate;
    const monthlyCost = dailyCost * 30;
    
    // Mock historical comparison (would come from real data)
    const yesterdayPower = totalPower * (0.8 + Math.random() * 0.4); // ±20% variation
    const powerTrend = ((totalPower - yesterdayPower) / yesterdayPower) * 100;
    
    return {
      totalPower,
      activeCount,
      offlineCount,
      dailyCost,
      monthlyCost,
      powerTrend,
      efficiency: totalPower > 0 ? Math.min(95, 75 + Math.random() * 20) : 0, // Mock efficiency
    };
  }, [devices, activeDevices]);

  // Device consumption data for pie chart
  const deviceConsumptionData = useMemo(() => {
    return activeDevices
      .filter(d => (d as any).status?.switch === true)
      .map((device, index) => ({
        name: device.name,
        value: (device as any).status?.energy?.activePower || 0,
        color: [
          theme.palette.primary.main,
          theme.palette.secondary.main,
          theme.palette.error.main,
          theme.palette.warning.main,
          theme.palette.info.main,
          theme.palette.success.main,
        ][index % 6],
      }))
      .sort((a, b) => b.value - a.value);
  }, [activeDevices, theme]);

  // Mock hourly consumption data for bar chart
  const hourlyData = useMemo(() => {
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, '0') + ':00';
      const baseConsumption = statistics.totalPower;
      // Create realistic daily pattern
      const timeOfDay = i / 24;
      const pattern = Math.sin(timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.3 + 1;
      const consumption = baseConsumption * pattern * (0.8 + Math.random() * 0.4);
      
      hours.push({
        hour,
        consumption: Math.max(0, consumption),
        cost: (consumption / 1000) * 0.22,
      });
    }
    return hours;
  }, [statistics.totalPower]);

  const formatPower = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)} kW`;
    return `${value.toFixed(0)} W`;
  };

  const formatCurrency = (value: number) => `€${value.toFixed(2)}`;

  const handleExportData = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      devices: devices.map(d => ({
        id: d._id,
        name: d.name,
        type: d.deviceType,
        isOnline: d.isOnline,
        isActive: (d as any).status?.switch,
        power: (d as any).status?.energy?.activePower || 0,
        voltage: (d as any).status?.energy?.voltage || 0,
        current: (d as any).status?.energy?.current || 0,
      })),
      statistics,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maestro-energy-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const StatCard = ({ 
    title, 
    value, 
    unit, 
    trend, 
    icon, 
    color = 'primary' 
  }: { 
    title: string;
    value: number | string;
    unit?: string;
    trend?: number;
    icon: React.ReactNode;
    color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  }) => (
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
              backgroundColor: `${color}.light`,
              color: `${color}.main`,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {value}{unit}
            </Typography>
            {trend !== undefined && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {trend > 0 ? (
                  <TrendingUpIcon sx={{ fontSize: 16, color: 'error.main' }} />
                ) : (
                  <TrendingDownIcon sx={{ fontSize: 16, color: 'success.main' }} />
                )}
                <Typography 
                  variant="caption" 
                  color={trend > 0 ? 'error.main' : 'success.main'}
                >
                  {Math.abs(trend).toFixed(1)}% vs yesterday
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  const renderOverviewTab = () => (
    <Grid container spacing={3}>
      {/* Statistics Cards */}
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Total Power"
          value={formatPower(statistics.totalPower)}
          trend={statistics.powerTrend}
          icon={<EnergyIcon />}
          color="primary"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Daily Cost"
          value={formatCurrency(statistics.dailyCost)}
          icon={<EuroIcon />}
          color="warning"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Active Devices"
          value={statistics.activeCount}
          unit={` / ${devices.length}`}
          icon={<EnergyIcon />}
          color="success"
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Efficiency"
          value={statistics.efficiency.toFixed(0)}
          unit="%"
          icon={<TrendingUpIcon />}
          color="secondary"
        />
      </Grid>

      {/* Energy Chart */}
      <Grid item xs={12} md={8}>
        <EnergyChart 
          devices={devices} 
          chartType={chartType}
          timeRange={timeRange}
        />
      </Grid>

      {/* Device Consumption Pie Chart */}
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Device Consumption
            </Typography>
            {deviceConsumptionData.length > 0 ? (
              <Box sx={{ height: 250 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={deviceConsumptionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => 
                        `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {deviceConsumptionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number) => [formatPower(value), 'Power']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <PieChartIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No active devices to display
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderConsumptionTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              24-Hour Consumption Pattern
            </Typography>
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis tickFormatter={formatPower} />
                  <RechartsTooltip 
                    formatter={(value: number) => [formatPower(value), 'Consumption']}
                  />
                  <Bar dataKey="consumption" fill={theme.palette.primary.main} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const renderCostsTab = () => (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Cost Breakdown
            </Typography>
            <Box sx={{ space: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography>Current Hour:</Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  {formatCurrency((statistics.totalPower / 1000) * 0.22)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography>Estimated Daily:</Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  {formatCurrency(statistics.dailyCost)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography>Estimated Monthly:</Typography>
                <Typography sx={{ fontWeight: 600, color: 'warning.main' }}>
                  {formatCurrency(statistics.monthlyCost)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary">
                  Rate: €0.22/kWh
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Hourly Costs (24h)
            </Typography>
            <Box sx={{ height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis tickFormatter={formatCurrency} />
                  <RechartsTooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Cost']}
                  />
                  <Bar dataKey="cost" fill={theme.palette.warning.main} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  return (
    <Box>
      {/* Header Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Energy Analytics
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={timeRange}
              label="Time Range"
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            >
              <MenuItem value="24h">Last 24 Hours</MenuItem>
              <MenuItem value="7d">Last 7 Days</MenuItem>
              <MenuItem value="30d">Last 30 Days</MenuItem>
            </Select>
          </FormControl>

          <ButtonGroup size="small">
            <Button 
              variant={chartType === 'line' ? 'contained' : 'outlined'}
              onClick={() => setChartType('line')}
            >
              Line
            </Button>
            <Button 
              variant={chartType === 'area' ? 'contained' : 'outlined'}
              onClick={() => setChartType('area')}
            >
              Area
            </Button>
          </ButtonGroup>

          <Tooltip title="Export Data">
            <IconButton onClick={handleExportData} color="primary">
              <ExportIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ mb: 3 }}>
        <Tabs 
          value={currentView} 
          onChange={(_, newValue) => setCurrentView(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Overview" value="overview" />
          <Tab label="Consumption" value="consumption" />
          <Tab label="Costs" value="costs" />
          <Tab label="Devices" value="devices" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {currentView === 'overview' && renderOverviewTab()}
      {currentView === 'consumption' && renderConsumptionTab()}
      {currentView === 'costs' && renderCostsTab()}
      {currentView === 'devices' && (
        <Typography variant="body1" color="text.secondary">
          Device-specific analytics coming soon...
        </Typography>
      )}
    </Box>
  );
};

export default EnergyAnalytics;