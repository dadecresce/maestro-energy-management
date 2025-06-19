import { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useTheme,
} from '@mui/material';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import type { Device } from '@maestro/shared';

interface EnergyChartProps {
  devices: Device[];
  chartType?: 'line' | 'area';
  timeRange?: '24h' | '7d' | '30d';
  showLegend?: boolean;
}

const EnergyChart = ({ 
  devices, 
  chartType = 'line',
  timeRange = '24h',
  showLegend = true 
}: EnergyChartProps) => {
  const theme = useTheme();

  // Generate mock historical data based on current device states
  const chartData = useMemo(() => {
    const now = new Date();
    const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 24 * 7 : 24 * 30;
    const interval = timeRange === '24h' ? 1 : timeRange === '7d' ? 24 : 24;
    
    const data = [];
    
    for (let i = hours; i >= 0; i -= interval) {
      const time = new Date(now.getTime() - (i * 60 * 60 * 1000));
      const timeLabel = timeRange === '24h' 
        ? time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const dataPoint: any = {
        time: timeLabel,
        timestamp: time.getTime(),
      };
      
      // Add data for each active device
      devices.forEach(device => {
        if (device.status.energy?.activePower && device.status.switch) {
          const basePower = device.status.energy.activePower;
          // Add some realistic variation (±20%)
          const variation = (Math.random() - 0.5) * 0.4;
          const timeVariation = Math.sin((i / hours) * Math.PI * 2) * 0.3; // Daily pattern
          dataPoint[device.name] = Math.max(0, basePower * (1 + variation + timeVariation));
        } else {
          dataPoint[device.name] = 0;
        }
      });
      
      // Calculate total
      dataPoint.total = Object.keys(dataPoint)
        .filter(key => key !== 'time' && key !== 'timestamp' && key !== 'total')
        .reduce((sum, key) => sum + (dataPoint[key] || 0), 0);
      
      data.push(dataPoint);
    }
    
    return data.reverse();
  }, [devices, timeRange]);

  const activeDevices = devices.filter(d => 
    d.status.energy?.activePower && 
    d.status.switch && 
    d.isOnline
  );

  const colors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.error.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.success.main,
  ];

  const formatPower = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)} kW`;
    return `${value.toFixed(0)} W`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <Card sx={{ p: 1, boxShadow: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography
              key={index}
              variant="caption"
              sx={{ 
                color: entry.color,
                display: 'block',
                fontWeight: entry.dataKey === 'total' ? 600 : 400
              }}
            >
              {entry.dataKey === 'total' ? 'Total: ' : `${entry.dataKey}: `}
              {formatPower(entry.value)}
            </Typography>
          ))}
        </Card>
      );
    }
    return null;
  };

  if (activeDevices.length === 0) {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Active Devices
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Turn on some devices to see energy consumption data
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const ChartComponent = chartType === 'area' ? AreaChart : LineChart;
  const DataComponent = chartType === 'area' ? Area : Line;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>
            Energy Consumption
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Time Range</InputLabel>
              <Select
                value={timeRange}
                label="Time Range"
                disabled // For now, since we don't have the onChange handler
              >
                <MenuItem value="24h">Last 24 Hours</MenuItem>
                <MenuItem value="7d">Last 7 Days</MenuItem>
                <MenuItem value="30d">Last 30 Days</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis 
                dataKey="time" 
                stroke={theme.palette.text.secondary}
                fontSize={12}
              />
              <YAxis 
                stroke={theme.palette.text.secondary}
                fontSize={12}
                tickFormatter={formatPower}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && <Legend />}
              
              {/* Total consumption line/area */}
              <DataComponent
                type="monotone"
                dataKey="total"
                stroke={theme.palette.primary.main}
                fill={chartType === 'area' ? theme.palette.primary.light : undefined}
                fillOpacity={chartType === 'area' ? 0.3 : undefined}
                strokeWidth={3}
                name="Total"
              />
              
              {/* Individual device lines/areas */}
              {activeDevices.slice(0, 5).map((device, index) => (
                <DataComponent
                  key={device._id}
                  type="monotone"
                  dataKey={device.name}
                  stroke={colors[index + 1] || colors[0]}
                  fill={chartType === 'area' ? colors[index + 1] || colors[0] : undefined}
                  fillOpacity={chartType === 'area' ? 0.1 : undefined}
                  strokeWidth={2}
                  name={device.name}
                />
              ))}
            </ChartComponent>
          </ResponsiveContainer>
        </Box>

        {/* Energy Summary */}
        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Current Total Consumption: {formatPower(
              activeDevices.reduce((sum, d) => sum + (d.status.energy?.activePower || 0), 0)
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Estimated daily cost: €{(
              (activeDevices.reduce((sum, d) => sum + (d.status.energy?.activePower || 0), 0) / 1000) * 24 * 0.22
            ).toFixed(2)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default EnergyChart;