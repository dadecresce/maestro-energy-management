import { z } from 'zod';
import { ObjectId, EnergyUnit, TimeRange } from './base';

// Energy Measurement Schema (Phase 2 - Time Series Data)
export const EnergyMeasurementSchema = z.object({
  deviceId: z.string(),
  timestamp: z.date(),
  measurements: z.object({
    // Power measurements
    activePower: z.number().optional(), // Current power consumption/production (W)
    reactivePower: z.number().optional(), // Reactive power (VAR)
    apparentPower: z.number().optional(), // Apparent power (VA)
    powerFactor: z.number().min(-1).max(1).optional(), // Power factor
    
    // Electrical measurements
    voltage: z.number().optional(), // RMS voltage (V)
    current: z.number().optional(), // RMS current (A)
    frequency: z.number().optional(), // Frequency (Hz)
    
    // Energy measurements
    energy: z.number().optional(), // Cumulative energy (kWh)
    energyConsumed: z.number().optional(), // Energy consumed since last reading (kWh)
    energyProduced: z.number().optional(), // Energy produced since last reading (kWh)
    
    // Phase-specific measurements (for 3-phase systems)
    phaseA: z.object({
      voltage: z.number().optional(),
      current: z.number().optional(),
      power: z.number().optional()
    }).optional(),
    phaseB: z.object({
      voltage: z.number().optional(),
      current: z.number().optional(),
      power: z.number().optional()
    }).optional(),
    phaseC: z.object({
      voltage: z.number().optional(),
      current: z.number().optional(),
      power: z.number().optional()
    }).optional(),
    
    // Environmental data
    temperature: z.number().optional(), // Device temperature (°C)
    humidity: z.number().optional(), // Relative humidity (%)
    
    // Device-specific measurements
    batteryLevel: z.number().min(0).max(100).optional(), // Battery charge level (%)
    solarIrradiance: z.number().optional(), // Solar irradiance (W/m²)
    efficiency: z.number().min(0).max(1).optional(), // Efficiency ratio (0-1)
    
    // Cost and carbon data
    costRate: z.number().optional(), // Current energy cost rate (currency/kWh)
    carbonIntensity: z.number().optional(), // Carbon intensity (kg CO2/kWh)
    
    // Quality indicators
    quality: z.enum(['good', 'fair', 'poor', 'unknown']).default('unknown'),
    confidence: z.number().min(0).max(1).default(1) // Measurement confidence (0-1)
  }),
  
  // Metadata
  source: z.enum(['device', 'calculated', 'estimated', 'manual']).default('device'),
  tags: z.record(z.string()).optional() // Additional metadata tags
});

export type EnergyMeasurement = z.infer<typeof EnergyMeasurementSchema>;

// Energy Flow Schema (Phase 2 - Real-time Energy Flow)
export const EnergyFlowSchema = z.object({
  timestamp: z.date(),
  flows: z.array(z.object({
    from: z.string(), // Source device/grid ID
    to: z.string(), // Destination device/grid ID
    power: z.number(), // Power flow (W, positive = flowing)
    energy: z.number().optional(), // Energy transferred (kWh)
    efficiency: z.number().min(0).max(1).optional(), // Transfer efficiency
    cost: z.number().optional(), // Cost of this flow (currency)
    carbon: z.number().optional() // Carbon emissions (kg CO2)
  })),
  totalProduction: z.number(), // Total production (W)
  totalConsumption: z.number(), // Total consumption (W)
  gridImport: z.number(), // Power imported from grid (W)
  gridExport: z.number(), // Power exported to grid (W)
  batteryCharge: z.number(), // Battery charging power (W)
  batteryDischarge: z.number(), // Battery discharging power (W)
  netPower: z.number() // Net power balance (W, positive = surplus)
});

export type EnergyFlow = z.infer<typeof EnergyFlowSchema>;

// Energy Statistics Schema
export const EnergyStatsSchema = z.object({
  deviceId: z.string(),
  period: z.enum(['hour', 'day', 'week', 'month', 'year']),
  periodStart: z.date(),
  periodEnd: z.date(),
  
  // Consumption statistics
  consumption: z.object({
    total: z.number(), // Total energy consumed (kWh)
    average: z.number(), // Average power (W)
    peak: z.number(), // Peak power (W)
    minimum: z.number(), // Minimum power (W)
    peakTime: z.date().optional(), // Time of peak consumption
    averageDaily: z.number().optional(), // Average daily consumption (kWh)
    weekdayAverage: z.number().optional(), // Weekday average (kWh)
    weekendAverage: z.number().optional() // Weekend average (kWh)
  }).optional(),
  
  // Production statistics (Phase 2)
  production: z.object({
    total: z.number(), // Total energy produced (kWh)
    average: z.number(), // Average power production (W)
    peak: z.number(), // Peak power production (W)
    peakTime: z.date().optional(), // Time of peak production
    efficiency: z.number().optional(), // Average efficiency (0-1)
    capacity: z.number().optional() // Capacity factor (0-1)
  }).optional(),
  
  // Financial data
  cost: z.object({
    total: z.number(), // Total cost (currency)
    average: z.number(), // Average cost per kWh
    savings: z.number().optional(), // Savings from self-consumption
    revenue: z.number().optional() // Revenue from grid export
  }).optional(),
  
  // Environmental data
  carbon: z.object({
    total: z.number(), // Total carbon emissions (kg CO2)
    average: z.number(), // Average carbon intensity (kg CO2/kWh)
    avoided: z.number().optional() // Carbon emissions avoided (kg CO2)
  }).optional(),
  
  // Operational data
  uptime: z.number().min(0).max(1), // Device uptime percentage
  dataPoints: z.number(), // Number of data points in period
  dataQuality: z.number().min(0).max(1), // Data quality score
  
  // Comparisons
  compared: z.object({
    previousPeriod: z.number().optional(), // % change from previous period
    yearAgo: z.number().optional(), // % change from year ago
    targetUsage: z.number().optional(), // % of target usage
    benchmark: z.number().optional() // Comparison to benchmark
  }).optional()
});

export type EnergyStats = z.infer<typeof EnergyStatsSchema>;

// Energy Alert Schema
export const EnergyAlertSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  deviceId: z.string().optional(), // Alert for specific device or system-wide
  
  // Alert definition
  type: z.enum([
    'high_consumption',
    'low_production',
    'high_cost',
    'grid_outage',
    'battery_low',
    'battery_full',
    'efficiency_drop',
    'maintenance_required',
    'anomaly_detected',
    'target_exceeded',
    'custom'
  ]),
  
  // Trigger conditions
  threshold: z.object({
    value: z.number(),
    unit: EnergyUnit,
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne']),
    duration: z.number().optional() // Minutes that condition must persist
  }),
  
  // Alert state
  isActive: z.boolean(),
  isAcknowledged: z.boolean().default(false),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  
  // Alert details
  title: z.string(),
  message: z.string(),
  recommendation: z.string().optional(),
  
  // Timing
  triggeredAt: z.date().optional(),
  acknowledgedAt: z.date().optional(),
  resolvedAt: z.date().optional(),
  nextCheckAt: z.date().optional(),
  
  // Configuration
  enabled: z.boolean().default(true),
  channels: z.array(z.enum(['push', 'email', 'sms', 'webhook'])),
  cooldownMinutes: z.number().default(60),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date()
});

export type EnergyAlert = z.infer<typeof EnergyAlertSchema>;

// Energy Optimization Schema (Phase 2)
export const EnergyOptimizationSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  
  // Optimization target
  objective: z.enum(['minimize_cost', 'minimize_carbon', 'maximize_self_consumption', 'load_balancing']),
  priority: z.number().min(1).max(10).default(5),
  
  // Time constraints
  timeRange: TimeRange,
  constraints: z.object({
    maxPowerDraw: z.number().optional(), // Maximum total power draw (W)
    essentialDevices: z.array(z.string()).default([]), // Device IDs that cannot be controlled
    preferredSchedule: z.array(z.object({
      deviceId: z.string(),
      preferredTimes: z.array(z.string()) // HH:MM format
    })).default([])
  }),
  
  // Optimization results
  recommendations: z.array(z.object({
    deviceId: z.string(),
    action: z.enum(['turn_on', 'turn_off', 'schedule', 'adjust_power', 'delay']),
    scheduledTime: z.date().optional(),
    powerLevel: z.number().optional(), // For dimmable devices
    estimatedSavings: z.number().optional(), // Currency
    estimatedCarbonReduction: z.number().optional(), // kg CO2
    confidence: z.number().min(0).max(1) // Recommendation confidence
  })).default([]),
  
  // Status
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  
  // Results
  results: z.object({
    totalSavings: z.number().optional(), // Currency
    carbonReduction: z.number().optional(), // kg CO2
    peakReduction: z.number().optional(), // W
    executedRecommendations: z.number().default(0),
    successRate: z.number().min(0).max(1).optional()
  }).optional(),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional()
});

export type EnergyOptimization = z.infer<typeof EnergyOptimizationSchema>;

// Energy Report Schema
export const EnergyReportSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  reportType: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']),
  period: TimeRange,
  
  // Report data
  summary: z.object({
    totalConsumption: z.number(), // kWh
    totalProduction: z.number().optional(), // kWh
    totalCost: z.number(), // Currency
    totalSavings: z.number().optional(), // Currency
    totalCarbon: z.number(), // kg CO2
    averageEfficiency: z.number().optional(), // 0-1
    systemUptime: z.number() // 0-1
  }),
  
  deviceBreakdown: z.array(z.object({
    deviceId: z.string(),
    deviceName: z.string(),
    consumption: z.number(), // kWh
    cost: z.number(), // Currency
    percentage: z.number(), // % of total consumption
    uptime: z.number() // 0-1
  })),
  
  insights: z.array(z.object({
    type: z.enum(['efficiency_tip', 'cost_saving', 'usage_pattern', 'anomaly', 'achievement']),
    title: z.string(),
    description: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
    actionable: z.boolean()
  })),
  
  // Metadata
  generatedAt: z.date(),
  format: z.enum(['json', 'pdf', 'csv']).default('json'),
  size: z.number().optional() // Report size in bytes
});

export type EnergyReport = z.infer<typeof EnergyReportSchema>;

// Helper types for specific energy contexts

// Real-time energy dashboard data
export interface EnergyDashboardData {
  currentPower: number; // Current total power (W)
  todayConsumption: number; // Today's consumption (kWh)
  todayCost: number; // Today's cost (currency)
  currentCost: number; // Current cost rate (currency/kWh)
  peakPower: number; // Today's peak power (W)
  peakTime: Date; // Time of peak power
  activeDevices: number; // Number of active devices
  totalDevices: number; // Total number of devices
  carbonFootprint: number; // Today's carbon footprint (kg CO2)
  efficiency: number; // System efficiency (0-1)
  gridStatus: 'connected' | 'disconnected' | 'exporting' | 'importing';
  batteryLevel?: number; // Battery charge level (%)
  solarProduction?: number; // Current solar production (W)
}

// Energy optimization recommendation
export interface OptimizationRecommendation {
  deviceId: string;
  deviceName: string;
  currentPower: number; // W
  recommendedPower: number; // W
  action: 'reduce' | 'increase' | 'schedule' | 'turn_off';
  reason: string;
  savings: number; // Currency per day
  carbonReduction: number; // kg CO2 per day
  feasibility: number; // 0-1
}