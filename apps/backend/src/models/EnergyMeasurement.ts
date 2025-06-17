import { Schema, model, Document, Types } from 'mongoose';
import {
  EnergyMeasurement as EnergyMeasurementType,
  EnergyFlow,
  EnergyStats,
  EnergyAlert,
  EnergyOptimization,
  EnergyReport
} from '@maestro/shared/types/energy';
import { EnergyUnit } from '@maestro/shared/types/base';

/**
 * MongoDB Document Interface for Energy Measurement
 * Optimized for time-series data and future InfluxDB migration
 */
export interface IEnergyMeasurementDocument extends Document {
  _id: Types.ObjectId;
  deviceId: string;
  userId: string; // Denormalized for faster queries
  timestamp: Date;
  measurements: {
    // Power measurements
    activePower?: number;
    reactivePower?: number;
    apparentPower?: number;
    powerFactor?: number;
    
    // Electrical measurements
    voltage?: number;
    current?: number;
    frequency?: number;
    
    // Energy measurements
    energy?: number;
    energyConsumed?: number;
    energyProduced?: number;
    
    // Phase-specific measurements (for 3-phase systems)
    phaseA?: {
      voltage?: number;
      current?: number;
      power?: number;
    };
    phaseB?: {
      voltage?: number;
      current?: number;
      power?: number;
    };
    phaseC?: {
      voltage?: number;
      current?: number;
      power?: number;
    };
    
    // Environmental data
    temperature?: number;
    humidity?: number;
    
    // Device-specific measurements
    batteryLevel?: number;
    solarIrradiance?: number;
    efficiency?: number;
    
    // Cost and carbon data
    costRate?: number;
    carbonIntensity?: number;
    
    // Quality indicators
    quality: 'good' | 'fair' | 'poor' | 'unknown';
    confidence: number;
  };
  source: 'device' | 'calculated' | 'estimated' | 'manual';
  tags?: Record<string, string>;
  
  // Instance methods
  isValid(): boolean;
  calculateCost(rate: number): number;
  calculateCarbon(intensity: number): number;
  interpolate(previousMeasurement: IEnergyMeasurementDocument, targetTimestamp: Date): IEnergyMeasurementDocument;
  toInfluxFormat(): any;
}

/**
 * Energy Flow Document for real-time energy distribution tracking
 */
export interface IEnergyFlowDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  timestamp: Date;
  flows: Array<{
    from: string;
    to: string;
    power: number;
    energy?: number;
    efficiency?: number;
    cost?: number;
    carbon?: number;
  }>;
  totalProduction: number;
  totalConsumption: number;
  gridImport: number;
  gridExport: number;
  batteryCharge: number;
  batteryDischarge: number;
  netPower: number;
}

/**
 * Energy Statistics Document for aggregated data
 */
export interface IEnergyStatsDocument extends Document {
  _id: Types.ObjectId;
  deviceId: string;
  userId: string;
  period: 'hour' | 'day' | 'week' | 'month' | 'year';
  periodStart: Date;
  periodEnd: Date;
  consumption?: {
    total: number;
    average: number;
    peak: number;
    minimum: number;
    peakTime?: Date;
    averageDaily?: number;
    weekdayAverage?: number;
    weekendAverage?: number;
  };
  production?: {
    total: number;
    average: number;
    peak: number;
    peakTime?: Date;
    efficiency?: number;
    capacity?: number;
  };
  cost?: {
    total: number;
    average: number;
    savings?: number;
    revenue?: number;
  };
  carbon?: {
    total: number;
    average: number;
    avoided?: number;
  };
  uptime: number;
  dataPoints: number;
  dataQuality: number;
  compared?: {
    previousPeriod?: number;
    yearAgo?: number;
    targetUsage?: number;
    benchmark?: number;
  };
}

/**
 * Phase Measurements Schema
 */
const PhaseMeasurementSchema = new Schema({
  voltage: {
    type: Number,
    min: 0,
    max: 1000
  },
  current: {
    type: Number,
    min: 0,
    max: 1000
  },
  power: {
    type: Number,
    min: -100000,
    max: 100000
  }
}, { _id: false });

/**
 * Measurements Schema
 */
const MeasurementsSchema = new Schema({
  // Power measurements
  activePower: {
    type: Number,
    min: -100000,
    max: 100000
  },
  reactivePower: {
    type: Number,
    min: -100000,
    max: 100000
  },
  apparentPower: {
    type: Number,
    min: 0,
    max: 100000
  },
  powerFactor: {
    type: Number,
    min: -1,
    max: 1
  },
  
  // Electrical measurements
  voltage: {
    type: Number,
    min: 0,
    max: 1000
  },
  current: {
    type: Number,
    min: 0,
    max: 1000
  },
  frequency: {
    type: Number,
    min: 40,
    max: 70
  },
  
  // Energy measurements
  energy: {
    type: Number,
    min: 0
  },
  energyConsumed: {
    type: Number,
    min: 0
  },
  energyProduced: {
    type: Number,
    min: 0
  },
  
  // Phase-specific measurements
  phaseA: PhaseMeasurementSchema,
  phaseB: PhaseMeasurementSchema,
  phaseC: PhaseMeasurementSchema,
  
  // Environmental data
  temperature: {
    type: Number,
    min: -50,
    max: 150
  },
  humidity: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Device-specific measurements
  batteryLevel: {
    type: Number,
    min: 0,
    max: 100
  },
  solarIrradiance: {
    type: Number,
    min: 0,
    max: 2000
  },
  efficiency: {
    type: Number,
    min: 0,
    max: 1
  },
  
  // Cost and carbon data
  costRate: {
    type: Number,
    min: 0
  },
  carbonIntensity: {
    type: Number,
    min: 0
  },
  
  // Quality indicators
  quality: {
    type: String,
    enum: ['good', 'fair', 'poor', 'unknown'],
    default: 'unknown'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 1
  }
}, { _id: false });

/**
 * Main Energy Measurement Schema
 */
const EnergyMeasurementSchema = new Schema<IEnergyMeasurementDocument>({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    index: true
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  timestamp: {
    type: Date,
    required: [true, 'Timestamp is required'],
    index: true
  },
  measurements: {
    type: MeasurementsSchema,
    required: true
  },
  source: {
    type: String,
    enum: ['device', 'calculated', 'estimated', 'manual'],
    default: 'device',
    index: true
  },
  tags: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: false, // We manage timestamp ourselves
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    }
  }
});

/**
 * Energy Flow Schema (Phase 2)
 */
const EnergyFlowSchema = new Schema<IEnergyFlowDocument>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  flows: [{
    from: { type: String, required: true },
    to: { type: String, required: true },
    power: { type: Number, required: true },
    energy: Number,
    efficiency: { type: Number, min: 0, max: 1 },
    cost: Number,
    carbon: Number
  }],
  totalProduction: { type: Number, required: true },
  totalConsumption: { type: Number, required: true },
  gridImport: { type: Number, required: true },
  gridExport: { type: Number, required: true },
  batteryCharge: { type: Number, required: true },
  batteryDischarge: { type: Number, required: true },
  netPower: { type: Number, required: true }
}, {
  timestamps: false,
  versionKey: false
});

/**
 * Energy Statistics Schema
 */
const EnergyStatsSchema = new Schema<IEnergyStatsDocument>({
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  period: {
    type: String,
    enum: ['hour', 'day', 'week', 'month', 'year'],
    required: true,
    index: true
  },
  periodStart: {
    type: Date,
    required: true,
    index: true
  },
  periodEnd: {
    type: Date,
    required: true,
    index: true
  },
  consumption: {
    total: { type: Number, min: 0 },
    average: { type: Number, min: 0 },
    peak: { type: Number, min: 0 },
    minimum: { type: Number, min: 0 },
    peakTime: Date,
    averageDaily: Number,
    weekdayAverage: Number,
    weekendAverage: Number
  },
  production: {
    total: { type: Number, min: 0 },
    average: { type: Number, min: 0 },
    peak: { type: Number, min: 0 },
    peakTime: Date,
    efficiency: { type: Number, min: 0, max: 1 },
    capacity: { type: Number, min: 0, max: 1 }
  },
  cost: {
    total: Number,
    average: Number,
    savings: Number,
    revenue: Number
  },
  carbon: {
    total: Number,
    average: Number,
    avoided: Number
  },
  uptime: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  dataPoints: {
    type: Number,
    min: 0,
    required: true
  },
  dataQuality: {
    type: Number,
    min: 0,
    max: 1,
    required: true
  },
  compared: {
    previousPeriod: Number,
    yearAgo: Number,
    targetUsage: Number,
    benchmark: Number
  }
}, {
  timestamps: true,
  versionKey: false
});

/**
 * Indexes for time-series optimization
 */

// Energy Measurements indexes
EnergyMeasurementSchema.index({ deviceId: 1, timestamp: 1 });
EnergyMeasurementSchema.index({ userId: 1, timestamp: 1 });
EnergyMeasurementSchema.index({ timestamp: 1, deviceId: 1 });
EnergyMeasurementSchema.index({ timestamp: 1, source: 1 });
EnergyMeasurementSchema.index({ 'measurements.quality': 1 });

// Compound indexes for analytics
EnergyMeasurementSchema.index({ userId: 1, deviceId: 1, timestamp: 1 });
EnergyMeasurementSchema.index({ deviceId: 1, timestamp: 1, source: 1 });

// TTL index for data retention (configurable per installation)
EnergyMeasurementSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 }); // 1 year default

// Energy Flow indexes
EnergyFlowSchema.index({ userId: 1, timestamp: 1 });
EnergyFlowSchema.index({ timestamp: 1 });

// Energy Stats indexes
EnergyStatsSchema.index({ deviceId: 1, period: 1, periodStart: 1 });
EnergyStatsSchema.index({ userId: 1, period: 1, periodStart: 1 });
EnergyStatsSchema.index({ period: 1, periodStart: 1 });

/**
 * Instance Methods for Energy Measurement
 */

// Validate measurement data
EnergyMeasurementSchema.methods.isValid = function(): boolean {
  const m = this.measurements;
  
  // Check for at least one meaningful measurement
  if (!m.activePower && !m.energy && !m.voltage && !m.current) {
    return false;
  }
  
  // Validate power factor range
  if (m.powerFactor !== undefined && (m.powerFactor < -1 || m.powerFactor > 1)) {
    return false;
  }
  
  // Validate efficiency range
  if (m.efficiency !== undefined && (m.efficiency < 0 || m.efficiency > 1)) {
    return false;
  }
  
  return true;
};

// Calculate cost based on energy rate
EnergyMeasurementSchema.methods.calculateCost = function(rate: number): number {
  const energy = this.measurements.energyConsumed || 0;
  return energy * rate;
};

// Calculate carbon footprint
EnergyMeasurementSchema.methods.calculateCarbon = function(intensity: number): number {
  const energy = this.measurements.energyConsumed || 0;
  return energy * intensity;
};

// Convert to InfluxDB format for future migration
EnergyMeasurementSchema.methods.toInfluxFormat = function(): any {
  return {
    measurement: 'energy_data',
    tags: {
      device_id: this.deviceId,
      user_id: this.userId,
      source: this.source,
      quality: this.measurements.quality,
      ...this.tags
    },
    fields: {
      ...this.measurements.toObject(),
      confidence: this.measurements.confidence
    },
    timestamp: this.timestamp
  };
};

/**
 * Static Methods for Energy Measurement
 */

// Find measurements for device in time range
EnergyMeasurementSchema.statics.findByDeviceAndTimeRange = function(
  deviceId: string,
  startTime: Date,
  endTime: Date
) {
  return this.find({
    deviceId,
    timestamp: { $gte: startTime, $lte: endTime }
  }).sort({ timestamp: 1 });
};

// Find latest measurement for device
EnergyMeasurementSchema.statics.findLatestByDevice = function(deviceId: string) {
  return this.findOne({ deviceId }).sort({ timestamp: -1 });
};

// Aggregate measurements for statistics
EnergyMeasurementSchema.statics.aggregateForStats = function(
  deviceId: string,
  startTime: Date,
  endTime: Date,
  groupBy: 'hour' | 'day' | 'week' | 'month' = 'hour'
) {
  let dateFormat: string;
  switch (groupBy) {
    case 'hour':
      dateFormat = '%Y-%m-%d %H:00';
      break;
    case 'day':
      dateFormat = '%Y-%m-%d';
      break;
    case 'week':
      dateFormat = '%Y-W%U';
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
  }

  return this.aggregate([
    {
      $match: {
        deviceId,
        timestamp: { $gte: startTime, $lte: endTime },
        'measurements.quality': { $in: ['good', 'fair'] }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$timestamp' } },
        avgPower: { $avg: '$measurements.activePower' },
        maxPower: { $max: '$measurements.activePower' },
        minPower: { $min: '$measurements.activePower' },
        totalEnergy: { $sum: '$measurements.energyConsumed' },
        dataPoints: { $sum: 1 },
        avgEfficiency: { $avg: '$measurements.efficiency' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// Get real-time dashboard data
EnergyMeasurementSchema.statics.getDashboardData = function(userId: string) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return this.aggregate([
    {
      $match: {
        userId,
        timestamp: { $gte: dayStart }
      }
    },
    {
      $group: {
        _id: '$deviceId',
        currentPower: { $last: '$measurements.activePower' },
        todayEnergy: { $sum: '$measurements.energyConsumed' },
        peakPower: { $max: '$measurements.activePower' },
        avgEfficiency: { $avg: '$measurements.efficiency' },
        lastUpdate: { $max: '$timestamp' }
      }
    },
    {
      $group: {
        _id: null,
        totalPower: { $sum: '$currentPower' },
        totalEnergy: { $sum: '$todayEnergy' },
        peakPower: { $max: '$peakPower' },
        avgEfficiency: { $avg: '$avgEfficiency' },
        activeDevices: { $sum: 1 }
      }
    }
  ]);
};

/**
 * Model Exports
 */
export const EnergyMeasurement = model<IEnergyMeasurementDocument>('EnergyMeasurement', EnergyMeasurementSchema);
export const EnergyFlow = model<IEnergyFlowDocument>('EnergyFlow', EnergyFlowSchema);
export const EnergyStats = model<IEnergyStatsDocument>('EnergyStats', EnergyStatsSchema);

export default EnergyMeasurement;

/**
 * Type exports for external use
 */
export type { 
  IEnergyMeasurementDocument, 
  IEnergyFlowDocument, 
  IEnergyStatsDocument 
};
export { 
  EnergyMeasurementSchema, 
  EnergyFlowSchema, 
  EnergyStatsSchema 
};