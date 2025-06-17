import { Schema, model, Document, Types } from 'mongoose';

/**
 * Dashboard Widget Configuration
 */
export interface DashboardWidget {
  id: string;
  type: 'device_status' | 'energy_consumption' | 'cost_summary' | 'weather' | 'alerts' | 'quick_actions' | 'energy_flow' | 'charts' | 'custom';
  title: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  settings: Record<string, any>;
  isVisible: boolean;
  isCollapsed: boolean;
  refreshInterval?: number; // seconds
  dataSource?: string;
  filterCriteria?: Record<string, any>;
}

/**
 * Dashboard Layout Configuration
 */
export interface DashboardLayout {
  id: string;
  name: string;
  isDefault: boolean;
  widgets: DashboardWidget[];
  layout: 'grid' | 'masonry' | 'flex';
  columns: number;
  gridSize: number;
  theme: 'light' | 'dark' | 'auto';
  backgroundColor?: string;
  customCss?: string;
}

/**
 * Notification Preferences
 */
export interface NotificationPreferences {
  // Channel preferences
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
    categories: string[];
    quietHours: {
      enabled: boolean;
      startTime: string;
      endTime: string;
      timezone: string;
    };
  };
  push: {
    enabled: boolean;
    categories: string[];
    sound: boolean;
    vibration: boolean;
    quietHours: {
      enabled: boolean;
      startTime: string;
      endTime: string;
    };
  };
  sms: {
    enabled: boolean;
    categories: string[];
    emergencyOnly: boolean;
  };
  webhook: {
    enabled: boolean;
    url?: string;
    categories: string[];
    headers?: Record<string, string>;
  };
  
  // Category preferences
  deviceAlerts: boolean;
  energyAlerts: boolean;
  systemNotifications: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
  maintenanceNotifications: boolean;
  costThresholdAlerts: boolean;
  efficiencyReports: boolean;
}

/**
 * Energy Management Preferences
 */
export interface EnergyPreferences {
  // Pricing and billing
  tariffStructure: 'fixed' | 'time_of_use' | 'real_time' | 'tiered';
  energyProvider: string;
  currency: string;
  fixedRate?: number;
  timeOfUseRates?: {
    peak: { rate: number; hours: string[] };
    offPeak: { rate: number; hours: string[] };
    shoulder: { rate: number; hours: string[] };
  };
  
  // Optimization settings
  optimizationMode: 'cost' | 'carbon' | 'comfort' | 'performance' | 'custom';
  autoOptimization: boolean;
  loadShifting: boolean;
  demandResponse: boolean;
  
  // Thresholds and limits
  monthlyBudget?: number;
  dailyBudget?: number;
  peakDemandLimit?: number;
  carbonFootprintGoal?: number;
  
  // Preferences for different energy sources (Phase 2)
  solarPreferences?: {
    selfConsumptionPriority: number; // 0-100
    batteryChargeFromGrid: boolean;
    gridExportEnabled: boolean;
    feedInTariff?: number;
  };
  
  batteryPreferences?: {
    minChargeLevel: number; // 0-100
    maxChargeLevel: number; // 0-100
    emergencyReserve: number; // 0-100
    chargingSchedule?: string[];
  };
}

/**
 * Device Management Preferences
 */
export interface DevicePreferences {
  defaultSettings: {
    autoDiscovery: boolean;
    autoControl: boolean;
    energyMonitoring: boolean;
    schedulingEnabled: boolean;
    alertsEnabled: boolean;
  };
  
  grouping: {
    byRoom: boolean;
    byType: boolean;
    byUsage: boolean;
    customGroups: Array<{
      id: string;
      name: string;
      deviceIds: string[];
      color?: string;
      icon?: string;
    }>;
  };
  
  display: {
    showOfflineDevices: boolean;
    showEnergyConsumption: boolean;
    showLastSeen: boolean;
    sortBy: 'name' | 'type' | 'room' | 'lastSeen' | 'energyUsage';
    sortOrder: 'asc' | 'desc';
    viewMode: 'grid' | 'list' | 'compact';
  };
  
  automation: {
    enableAutoScheduling: boolean;
    enableGeofencing: boolean;
    enableOccupancyDetection: boolean;
    enableWeatherBasedControl: boolean;
  };
}

/**
 * Privacy and Security Preferences
 */
export interface PrivacyPreferences {
  dataRetention: {
    energyData: number; // days
    commandHistory: number; // days
    activityLogs: number; // days
    analytics: number; // days
  };
  
  sharing: {
    anonymousAnalytics: boolean;
    performanceMetrics: boolean;
    crashReporting: boolean;
    usageStatistics: boolean;
    marketResearch: boolean;
  };
  
  security: {
    twoFactorAuth: boolean;
    sessionTimeout: number; // minutes
    requirePasswordForSensitiveActions: boolean;
    logSecurityEvents: boolean;
    allowRemoteAccess: boolean;
    trustedDevices: string[];
  };
  
  export: {
    autoBackup: boolean;
    backupFrequency: 'daily' | 'weekly' | 'monthly';
    includeEnergyData: boolean;
    includeDeviceSettings: boolean;
    includePersonalData: boolean;
  };
}

/**
 * MongoDB Document Interface for User Preferences
 */
export interface IUserPreferencesDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  
  // Dashboard configuration
  dashboards: DashboardLayout[];
  activeDashboardId: string;
  
  // UI preferences
  ui: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    timezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
    temperatureUnit: 'celsius' | 'fahrenheit';
    energyUnit: 'kWh' | 'MWh' | 'BTU';
    powerUnit: 'W' | 'kW' | 'MW';
    currencySymbol: string;
    numberFormat: 'US' | 'EU' | 'UK';
    compactMode: boolean;
    animationsEnabled: boolean;
    accessibilityMode: boolean;
  };
  
  // Notification preferences
  notifications: NotificationPreferences;
  
  // Energy management preferences
  energy: EnergyPreferences;
  
  // Device management preferences
  devices: DevicePreferences;
  
  // Privacy and security
  privacy: PrivacyPreferences;
  
  // Custom preferences (extensible)
  custom: Record<string, any>;
  
  // Metadata
  version: number;
  lastModified: Record<string, Date>; // Track when each section was last modified
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  updateSection(section: string, data: any): Promise<void>;
  addDashboard(dashboard: DashboardLayout): Promise<void>;
  removeDashboard(dashboardId: string): Promise<void>;
  setActiveDashboard(dashboardId: string): Promise<void>;
  updateWidget(dashboardId: string, widgetId: string, updates: Partial<DashboardWidget>): Promise<void>;
  addWidget(dashboardId: string, widget: DashboardWidget): Promise<void>;
  removeWidget(dashboardId: string, widgetId: string): Promise<void>;
  resetToDefaults(sections?: string[]): Promise<void>;
  exportPreferences(): any;
  importPreferences(data: any): Promise<void>;
}

/**
 * Dashboard Widget Schema
 */
const DashboardWidgetSchema = new Schema<DashboardWidget>({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['device_status', 'energy_consumption', 'cost_summary', 'weather', 'alerts', 'quick_actions', 'energy_flow', 'charts', 'custom'],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  position: {
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 }
  },
  settings: {
    type: Schema.Types.Mixed,
    default: {}
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  isCollapsed: {
    type: Boolean,
    default: false
  },
  refreshInterval: {
    type: Number,
    min: 5,
    max: 3600
  },
  dataSource: String,
  filterCriteria: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

/**
 * Dashboard Layout Schema
 */
const DashboardLayoutSchema = new Schema<DashboardLayout>({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  widgets: {
    type: [DashboardWidgetSchema],
    default: []
  },
  layout: {
    type: String,
    enum: ['grid', 'masonry', 'flex'],
    default: 'grid'
  },
  columns: {
    type: Number,
    default: 12,
    min: 1,
    max: 24
  },
  gridSize: {
    type: Number,
    default: 8,
    min: 4,
    max: 20
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'auto'
  },
  backgroundColor: String,
  customCss: String
}, { _id: false });

/**
 * Notification Preferences Schema
 */
const NotificationPreferencesSchema = new Schema<NotificationPreferences>({
  email: {
    enabled: { type: Boolean, default: true },
    frequency: {
      type: String,
      enum: ['immediate', 'hourly', 'daily', 'weekly'],
      default: 'immediate'
    },
    categories: { type: [String], default: [] },
    quietHours: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: '22:00' },
      endTime: { type: String, default: '07:00' },
      timezone: { type: String, default: 'UTC' }
    }
  },
  push: {
    enabled: { type: Boolean, default: true },
    categories: { type: [String], default: [] },
    sound: { type: Boolean, default: true },
    vibration: { type: Boolean, default: true },
    quietHours: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: '22:00' },
      endTime: { type: String, default: '07:00' }
    }
  },
  sms: {
    enabled: { type: Boolean, default: false },
    categories: { type: [String], default: [] },
    emergencyOnly: { type: Boolean, default: true }
  },
  webhook: {
    enabled: { type: Boolean, default: false },
    url: String,
    categories: { type: [String], default: [] },
    headers: { type: Schema.Types.Mixed, default: {} }
  },
  deviceAlerts: { type: Boolean, default: true },
  energyAlerts: { type: Boolean, default: true },
  systemNotifications: { type: Boolean, default: true },
  marketingEmails: { type: Boolean, default: false },
  securityAlerts: { type: Boolean, default: true },
  maintenanceNotifications: { type: Boolean, default: true },
  costThresholdAlerts: { type: Boolean, default: true },
  efficiencyReports: { type: Boolean, default: true }
}, { _id: false });

/**
 * Main User Preferences Schema
 */
const UserPreferencesSchema = new Schema<IUserPreferencesDocument>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    unique: true,
    index: true
  },
  dashboards: {
    type: [DashboardLayoutSchema],
    default: function() {
      return [{
        id: 'default',
        name: 'Main Dashboard',
        isDefault: true,
        widgets: [],
        layout: 'grid',
        columns: 12,
        gridSize: 8,
        theme: 'auto'
      }];
    }
  },
  activeDashboardId: {
    type: String,
    default: 'default'
  },
  ui: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    dateFormat: {
      type: String,
      default: 'YYYY-MM-DD'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h'
    },
    temperatureUnit: {
      type: String,
      enum: ['celsius', 'fahrenheit'],
      default: 'celsius'
    },
    energyUnit: {
      type: String,
      enum: ['kWh', 'MWh', 'BTU'],
      default: 'kWh'
    },
    powerUnit: {
      type: String,
      enum: ['W', 'kW', 'MW'],
      default: 'W'
    },
    currencySymbol: {
      type: String,
      default: '€'
    },
    numberFormat: {
      type: String,
      enum: ['US', 'EU', 'UK'],
      default: 'EU'
    },
    compactMode: {
      type: Boolean,
      default: false
    },
    animationsEnabled: {
      type: Boolean,
      default: true
    },
    accessibilityMode: {
      type: Boolean,
      default: false
    }
  },
  notifications: {
    type: NotificationPreferencesSchema,
    default: () => ({})
  },
  energy: {
    tariffStructure: {
      type: String,
      enum: ['fixed', 'time_of_use', 'real_time', 'tiered'],
      default: 'fixed'
    },
    energyProvider: {
      type: String,
      default: ''
    },
    currency: {
      type: String,
      default: 'EUR'
    },
    fixedRate: {
      type: Number,
      default: 0.25
    },
    optimizationMode: {
      type: String,
      enum: ['cost', 'carbon', 'comfort', 'performance', 'custom'],
      default: 'cost'
    },
    autoOptimization: {
      type: Boolean,
      default: false
    },
    loadShifting: {
      type: Boolean,
      default: false
    },
    demandResponse: {
      type: Boolean,
      default: false
    },
    monthlyBudget: Number,
    dailyBudget: Number,
    peakDemandLimit: Number,
    carbonFootprintGoal: Number
  },
  devices: {
    defaultSettings: {
      autoDiscovery: { type: Boolean, default: true },
      autoControl: { type: Boolean, default: false },
      energyMonitoring: { type: Boolean, default: true },
      schedulingEnabled: { type: Boolean, default: true },
      alertsEnabled: { type: Boolean, default: true }
    },
    grouping: {
      byRoom: { type: Boolean, default: true },
      byType: { type: Boolean, default: true },
      byUsage: { type: Boolean, default: false },
      customGroups: {
        type: [{
          id: String,
          name: String,
          deviceIds: [String],
          color: String,
          icon: String
        }],
        default: []
      }
    },
    display: {
      showOfflineDevices: { type: Boolean, default: true },
      showEnergyConsumption: { type: Boolean, default: true },
      showLastSeen: { type: Boolean, default: true },
      sortBy: {
        type: String,
        enum: ['name', 'type', 'room', 'lastSeen', 'energyUsage'],
        default: 'name'
      },
      sortOrder: {
        type: String,
        enum: ['asc', 'desc'],
        default: 'asc'
      },
      viewMode: {
        type: String,
        enum: ['grid', 'list', 'compact'],
        default: 'grid'
      }
    },
    automation: {
      enableAutoScheduling: { type: Boolean, default: false },
      enableGeofencing: { type: Boolean, default: false },
      enableOccupancyDetection: { type: Boolean, default: false },
      enableWeatherBasedControl: { type: Boolean, default: false }
    }
  },
  privacy: {
    dataRetention: {
      energyData: { type: Number, default: 365 },
      commandHistory: { type: Number, default: 90 },
      activityLogs: { type: Number, default: 30 },
      analytics: { type: Number, default: 365 }
    },
    sharing: {
      anonymousAnalytics: { type: Boolean, default: true },
      performanceMetrics: { type: Boolean, default: true },
      crashReporting: { type: Boolean, default: true },
      usageStatistics: { type: Boolean, default: false },
      marketResearch: { type: Boolean, default: false }
    },
    security: {
      twoFactorAuth: { type: Boolean, default: false },
      sessionTimeout: { type: Number, default: 30 },
      requirePasswordForSensitiveActions: { type: Boolean, default: true },
      logSecurityEvents: { type: Boolean, default: true },
      allowRemoteAccess: { type: Boolean, default: true },
      trustedDevices: { type: [String], default: [] }
    },
    export: {
      autoBackup: { type: Boolean, default: false },
      backupFrequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'weekly'
      },
      includeEnergyData: { type: Boolean, default: true },
      includeDeviceSettings: { type: Boolean, default: true },
      includePersonalData: { type: Boolean, default: false }
    }
  },
  custom: {
    type: Schema.Types.Mixed,
    default: {}
  },
  version: {
    type: Number,
    default: 1
  },
  lastModified: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
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
 * Indexes
 */
UserPreferencesSchema.index({ userId: 1 }, { unique: true });
UserPreferencesSchema.index({ updatedAt: 1 });
UserPreferencesSchema.index({ version: 1 });

/**
 * Instance Methods
 */

// Update a specific section of preferences
UserPreferencesSchema.methods.updateSection = async function(section: string, data: any): Promise<void> {
  (this as any)[section] = { ...(this as any)[section], ...data };
  this.lastModified[section] = new Date();
  await this.save();
};

// Add new dashboard
UserPreferencesSchema.methods.addDashboard = async function(dashboard: DashboardLayout): Promise<void> {
  this.dashboards.push(dashboard);
  this.lastModified.dashboards = new Date();
  await this.save();
};

// Remove dashboard
UserPreferencesSchema.methods.removeDashboard = async function(dashboardId: string): Promise<void> {
  this.dashboards = this.dashboards.filter(d => d.id !== dashboardId);
  if (this.activeDashboardId === dashboardId && this.dashboards.length > 0) {
    this.activeDashboardId = this.dashboards[0].id;
  }
  this.lastModified.dashboards = new Date();
  await this.save();
};

// Set active dashboard
UserPreferencesSchema.methods.setActiveDashboard = async function(dashboardId: string): Promise<void> {
  if (this.dashboards.some(d => d.id === dashboardId)) {
    this.activeDashboardId = dashboardId;
    this.lastModified.dashboards = new Date();
    await this.save();
  }
};

// Update widget
UserPreferencesSchema.methods.updateWidget = async function(
  dashboardId: string, 
  widgetId: string, 
  updates: Partial<DashboardWidget>
): Promise<void> {
  const dashboard = this.dashboards.find(d => d.id === dashboardId);
  if (dashboard) {
    const widget = dashboard.widgets.find(w => w.id === widgetId);
    if (widget) {
      Object.assign(widget, updates);
      this.lastModified.dashboards = new Date();
      await this.save();
    }
  }
};

// Add widget
UserPreferencesSchema.methods.addWidget = async function(dashboardId: string, widget: DashboardWidget): Promise<void> {
  const dashboard = this.dashboards.find(d => d.id === dashboardId);
  if (dashboard) {
    dashboard.widgets.push(widget);
    this.lastModified.dashboards = new Date();
    await this.save();
  }
};

// Remove widget
UserPreferencesSchema.methods.removeWidget = async function(dashboardId: string, widgetId: string): Promise<void> {
  const dashboard = this.dashboards.find(d => d.id === dashboardId);
  if (dashboard) {
    dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
    this.lastModified.dashboards = new Date();
    await this.save();
  }
};

// Reset to defaults
UserPreferencesSchema.methods.resetToDefaults = async function(sections?: string[]): Promise<void> {
  const sectionsToReset = sections || ['ui', 'notifications', 'energy', 'devices', 'privacy'];
  
  for (const section of sectionsToReset) {
    if (section === 'dashboards') {
      this.dashboards = [{
        id: 'default',
        name: 'Main Dashboard',
        isDefault: true,
        widgets: [],
        layout: 'grid',
        columns: 12,
        gridSize: 8,
        theme: 'auto'
      }];
      this.activeDashboardId = 'default';
    }
    // Reset other sections to their schema defaults
    this.lastModified[section] = new Date();
  }
  
  await this.save();
};

// Export preferences
UserPreferencesSchema.methods.exportPreferences = function(): any {
  const exported = this.toObject();
  delete exported._id;
  delete exported.userId;
  delete exported.createdAt;
  delete exported.updatedAt;
  return exported;
};

// Import preferences
UserPreferencesSchema.methods.importPreferences = async function(data: any): Promise<void> {
  const allowedFields = ['dashboards', 'ui', 'notifications', 'energy', 'devices', 'privacy', 'custom'];
  
  for (const field of allowedFields) {
    if (data[field]) {
      (this as any)[field] = data[field];
      this.lastModified[field] = new Date();
    }
  }
  
  this.version += 1;
  await this.save();
};

/**
 * Static Methods
 */

// Find preferences by user ID
UserPreferencesSchema.statics.findByUser = function(userId: string) {
  return this.findOne({ userId });
};

// Create default preferences for user
UserPreferencesSchema.statics.createDefault = function(userId: string) {
  return this.create({ userId });
};

/**
 * User Preferences Model Export
 */
export const UserPreferences = model<IUserPreferencesDocument>('UserPreferences', UserPreferencesSchema);
export default UserPreferences;

/**
 * Type exports for external use
 */
export type { IUserPreferencesDocument, DashboardWidget, DashboardLayout, NotificationPreferences, EnergyPreferences, DevicePreferences, PrivacyPreferences };
export { UserPreferencesSchema };