# PROJECT OUTLINE - FASE 1 MVP
## Smart Plug Energy Management (Solar/Battery Ready Architecture)

---

## 1. SYSTEM ARCHITECTURE (FUTURE-PROOF)

### 1.1 High-Level Components
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React PWA     │────│   API Gateway    │────│  Protocol       │
│   (Frontend)    │    │   (Express.js)   │    │  Adapters       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       ├── Tuya API
         │                       │                       ├── Future: Modbus
         │                       │                       └── Future: MQTT
         │                       │
         v                       v
┌─────────────────┐    ┌──────────────────┐    
│   WebSocket     │    │   Data Layer     │    
│   (Real-time)   │    │   (Multi-DB)     │    
└─────────────────┘    └──────────────────┘    
                                │
                                ├── MongoDB (Metadata)
                                ├── Redis (Cache/Sessions)
                                └── Future: InfluxDB (Time-series)
```

### 1.2 Microservices-Ready Structure
```typescript
// MVP: Monolith con clear separation
src/
├── services/
│   ├── auth/              // Future: Auth Service
│   ├── devices/           // Future: Device Management Service  
│   ├── energy/            // Future: Energy Analytics Service
│   └── protocols/         // Future: Protocol Integration Service
├── shared/
│   ├── models/            // Unified data models
│   ├── events/            // Event-driven patterns
│   └── utils/             // Shared utilities
```

---

## 2. TECHNOLOGY STACK (SCALABLE)

### 2.1 Frontend Stack
**Core**: React 18 + TypeScript + Vite
```typescript
Dependencies:
- @mui/material: ^5.14.0        // Design system, theming
- zustand: ^4.4.0               // Lightweight state management  
- @tanstack/react-query: ^4.0   // Server state management
- socket.io-client: ^4.7.0      // Real-time communication
- recharts: ^2.8.0              // Energy consumption charts
- workbox-webpack-plugin: ^7.0  // PWA capabilities

Dev Dependencies:
- @testing-library/react: ^13.0 // Component testing
- cypress: ^13.0                // E2E testing
- @storybook/react: ^7.0        // Component documentation
```

**Architecture Benefits**:
- **Zustand**: Più leggero di Redux, perfect per energy dashboard real-time updates
- **React Query**: Ottimizza API calls, perfect per device polling
- **MUI**: Component system che supporta theming per future energy dashboard

### 2.2 Backend Stack  
**Core**: Node.js + Express + TypeScript
```typescript
Dependencies:
- express: ^4.18.0              // Web framework
- socket.io: ^4.7.0             // Real-time communication
- mongoose: ^7.5.0              // MongoDB ODM
- redis: ^4.6.0                 // Caching/sessions
- passport: ^0.6.0              // Authentication strategies
- joi: ^17.9.0                  // Input validation
- winston: ^3.10.0              // Structured logging

Protocol Adapters:
- @tuya/tuya-connector-nodejs   // Tuya integration
- modbus-serial: ^8.0           // Future: Modbus support
- mqtt: ^5.0                    // Future: MQTT support
```

**Architecture Benefits**:
- **Protocol Adapters**: Pattern che facilita aggiunta Modbus/SunSpec per inverter
- **Event-driven**: Socket.io + future event bus per energy real-time
- **TypeScript**: Type safety critico per energy data accuracy

### 2.3 Infrastructure & DevOps
```yaml
Development:
  frontend: Vite dev server + HMR
  backend: nodemon + ts-node  
  database: MongoDB local + Redis local
  
Staging:
  frontend: Vercel Preview Deployments
  backend: Railway staging environment
  database: MongoDB Atlas (free tier)
  
Production:
  frontend: Vercel (CDN + automatic deployments)
  backend: Railway (auto-scaling Node.js)
  database: MongoDB Atlas (production cluster)
  monitoring: Sentry + Vercel Analytics + Railway metrics
```

---

## 3. API DESIGN (EXTENSIBLE)

### 3.1 Unified Device API (Protocol Agnostic)
```typescript
// MVP Implementation + Future Structure
interface DeviceAPI {
  // Authentication
  'POST /v1/auth/tuya/oauth': 'Tuya OAuth flow';
  'POST /v1/auth/refresh': 'Token refresh';
  
  // Device Management (Protocol Agnostic)
  'GET /v1/devices': 'List all devices (with filters)';
  'GET /v1/devices/{id}': 'Get device details + capabilities';
  'POST /v1/devices/{id}/commands': 'Send device command';
  'GET /v1/devices/{id}/status': 'Get real-time status';
  'GET /v1/devices/{id}/telemetry': 'Get energy data (MVP: basic)';
  
  // Future-Ready Endpoints
  'POST /v1/devices/discover': 'Protocol-agnostic discovery';
  'GET /v1/energy/flows': 'Real-time energy flows (Phase 2)';
  'POST /v1/energy/optimize': 'Energy optimization (Phase 2)';
}
```

### 3.2 Protocol Abstraction Layer
```typescript
// MVP: Tuya only, ma structured per expansion
abstract class DeviceAdapter {
  abstract protocol: string;
  abstract discoverDevices(): Promise<DeviceInfo[]>;
  abstract sendCommand(deviceId: string, command: DeviceCommand): Promise<CommandResult>;
  abstract getStatus(deviceId: string): Promise<DeviceStatus>;
  abstract subscribeToUpdates(deviceId: string): Promise<EventSubscription>;
}

// MVP Implementation
class TuyaAdapter extends DeviceAdapter {
  protocol = 'tuya';
  // ... Tuya-specific implementation
}

// Phase 2: Ready for
// class ModbusAdapter extends DeviceAdapter { protocol = 'modbus'; }
// class MQTTAdapter extends DeviceAdapter { protocol = 'mqtt'; }
```

---

## 4. DATA MANAGEMENT (MULTI-DB READY)

### 4.1 Database Architecture
```typescript
// MVP: MongoDB focus, structured per future expansion
MongoDB Atlas (Primary):
- Users, devices metadata, settings, schedules
- Document-based, flexible schema per device types diversi

Redis (Cache/Real-time):
- Device status cache (5 min TTL)
- Session management
- Real-time device state
- Future: Event streaming buffer

Future Phase 2:
- InfluxDB: Time-series energy measurements
- PostgreSQL: Structured energy analytics, billing
```

### 4.2 Unified Data Models
```typescript
// MVP Schema + Phase 2 Ready
interface Device {
  _id: ObjectId;
  userId: ObjectId;
  
  // Generic device properties
  deviceId: string;           // External ID (Tuya, Modbus address, etc.)
  protocol: 'tuya' | 'modbus' | 'mqtt' | 'sunspec';
  deviceType: 'smart_plug' | 'solar_inverter' | 'battery_pack';
  
  // Capabilities (extensible)
  capabilities: DeviceCapability[];
  
  // Energy classification (Phase 2)
  energyRole?: 'consumer' | 'producer' | 'storage' | 'bidirectional';
  
  // Physical properties
  name: string;
  location?: string;
  specifications: {
    manufacturer: string;
    model: string;
    maxPower?: number;        // Watts
    capacity?: number;        // For batteries: kWh
  };
  
  // Status
  isOnline: boolean;
  lastSeenAt: Date;
  
  // User settings
  settings: {
    autoControl: boolean;
    schedules: Schedule[];
    alerts: AlertConfig[];
  };
}

interface DeviceCapability {
  type: 'switch' | 'energy_meter' | 'scheduler' | 'dimmer';
  properties: Record<string, any>;
  commands: string[];         // Supported commands
}

// Future Phase 2: Energy measurements
interface EnergyMeasurement {
  deviceId: string;
  timestamp: Date;
  measurements: {
    activePower?: number;     // Watts
    voltage?: number;         // Volts  
    current?: number;         // Amperes
    energy?: number;          // kWh accumulated
    // Phase 2: Additional solar/battery metrics
  };
}
```

---

## 5. USER INTERFACE (ENERGY DASHBOARD READY)

### 5.1 Component Architecture
```typescript
// MVP Components + Future Extensions
src/components/
├── common/
│   ├── Layout/             // App shell, navigation
│   ├── DeviceCard/         // Reusable device representation
│   └── EnergyChart/        // Basic energy visualization (extensible)
├── dashboard/
│   ├── DeviceGrid/         // Smart plug grid
│   ├── EnergyOverview/     // Basic consumption summary
│   └── QuickControls/      // Fast device toggles
├── device/
│   ├── DeviceDetail/       // Device control + settings
│   ├── DeviceScheduler/    // Timer/schedule interface
│   └── DeviceMetrics/      // Energy consumption charts
└── future/                 // Phase 2 ready
    ├── EnergyFlowDiagram/  // Solar/battery flow visualization
    ├── OptimizationPanel/  // Energy optimization interface
    └── SystemOverview/     // Whole-system energy management
```

### 5.2 Design System (Extensible)
```typescript
// Material-UI Theme Extensions
const energyTheme = createTheme({
  palette: {
    primary: { main: '#2E7D32' },      // Green (energy/sustainability)
    secondary: { main: '#FF9800' },    // Orange (solar)
    success: { main: '#4CAF50' },      // Green (device online)
    warning: { main: '#FFC107' },      // Yellow (warnings)
    error: { main: '#F44336' },        // Red (offline/errors)
    
    // Future: Energy-specific colors
    custom: {
      solar: '#FFB74D',               // Solar production
      battery: '#81C784',             // Battery storage
      grid: '#90A4AE',                // Grid consumption
      consumption: '#E57373'          // Energy consumption
    }
  },
  
  components: {
    // Custom components per energy management
    MuiDeviceCard: { /* styling */ },
    MuiEnergyMeter: { /* styling */ },
    MuiFlowDiagram: { /* Phase 2 */ }
  }
});
```

### 5.3 Screen Flow (MVP + Future)
```
MVP Flow:
Login → Dashboard → Device Detail → Settings

Phase 2 Flow:
Login → Energy Dashboard → Device Management → Energy Optimization → Settings

Shared Navigation:
- Bottom Tab Bar (mobile): Dashboard, Devices, Energy, Settings
- Progressive disclosure: advanced features hidden fino a Phase 2
```

---

## 6. SECURITY & PERFORMANCE

### 6.1 Security Architecture
```typescript
Authentication Flow:
1. User → Tuya OAuth consent
2. Tuya → Authorization code  
3. Backend → Exchange per access token
4. Backend → Generate JWT session token
5. Frontend → Store JWT securely (httpOnly cookie)

API Security:
- JWT tokens (1h expiration, refresh tokens)
- Rate limiting per endpoint (express-rate-limit)
- Input validation (Joi schemas)
- CORS properly configured
- Security headers (helmet.js)

Device Security:
- Command validation whitelist
- Device ownership verification
- Encrypted communication (HTTPS only)
- Audit logging per critical operations
```

### 6.2 Performance Optimization
```typescript
Frontend Performance:
- Code splitting per routes (React.lazy)
- Image optimization (WebP, lazy loading)  
- Service Worker caching (Workbox)
- Bundle analysis (webpack-bundle-analyzer)

Backend Performance:
- Redis caching per device status (5 min TTL)
- MongoDB connection pooling
- Response compression (gzip)
- API response optimization

Real-time Performance:
- WebSocket connection pooling
- Event debouncing per high-frequency updates
- Selective subscriptions (user subscribes only own devices)
```

---

## 7. TESTING STRATEGY

### 7.1 Testing Pyramid
```typescript
Unit Tests (70% target):
- Components: @testing-library/react
- Utilities: Jest
- API endpoints: Supertest
- Protocol adapters: Mock implementations

Integration Tests (20% target):
- API workflows end-to-end
- Database operations
- Real device communication (limited)
- WebSocket communication

E2E Tests (10% target):
- Critical user journeys (Cypress)
- Cross-browser compatibility (Chrome, Safari)
- Mobile responsive testing
- Performance testing (Lighthouse CI)
```

### 7.2 Device Testing Protocol
```typescript
Physical Testing Plan:
- Test con 5+ smart plug models diversi (Tuya certified)
- Network reliability testing (WiFi loss/recovery)
- Concurrent user testing (multiple users, same device)
- Performance testing (response times)
- Edge case testing (device offline, network slow)

Automated Testing:
- Mock Tuya API responses
- Device state simulation
- Error condition simulation
- Load testing (100+ concurrent WebSocket connections)
```

---

## 8. DEPLOYMENT & MONITORING

### 8.1 Deployment Pipeline
```yaml
CI/CD Pipeline (GitHub Actions):
  
  Pull Request:
    - Run tests (unit + integration)
    - Build verification  
    - Deploy preview (Vercel + Railway staging)
    - Run E2E tests against preview
    
  Main Branch:
    - Full test suite
    - Security scanning
    - Build production
    - Deploy to production (Vercel + Railway)
    - Run production smoke tests
    - Notify team (Slack)

Infrastructure as Code:
  - Docker containers per microservices readiness
  - Environment configuration (12-factor app)
  - Database migrations script
  - Backup procedures
```

### 8.2 Monitoring & Alerting
```typescript
Application Monitoring:
- Error tracking: Sentry (errors, performance)
- Analytics: Vercel Analytics (user behavior)
- Logs: Winston structured logging
- Metrics: Railway built-in metrics

Business Metrics:
- Device command success rate
- User engagement (DAU, session duration)
- Performance (API response times, WebSocket latency)
- Error rates per component

Alerting Rules:
- API error rate > 5% (1 minute)
- Device command success rate < 90% (5 minutes)  
- WebSocket disconnection rate > 10% (1 minute)
- Database connection issues (immediate)
```

---

## 9. DEVELOPMENT TIMELINE

### 9.1 Sprint Planning (12 Settimane)
```
Sprint 1-2 (Weeks 1-4): Foundation + Architecture
├── Project setup + CI/CD pipeline
├── Authentication implementation (Tuya OAuth)
├── Protocol adapter pattern implementation
├── Basic UI components + design system
├── Database schema + API foundation
└── WebSocket real-time foundation

Sprint 3-4 (Weeks 5-8): Core Functionality  
├── Device discovery + import (Tuya API)
├── Device control interface (on/off, status)
├── Real-time status updates (WebSocket)
├── Basic energy monitoring
├── Device management (rename, organize)
└── Mobile responsive implementation

Sprint 5-6 (Weeks 9-12): Polish + Deployment
├── Schedule/timer functionality
├── UI/UX refinement + animations
├── Error handling + offline mode
├── Performance optimization
├── Testing + bug fixes
└── Production deployment + beta launch
```

### 9.2 Parallel Development Tracks
```typescript
Frontend Track (Developer A):
- React component development
- UI/UX implementation  
- WebSocket client integration
- PWA implementation
- Testing (component + E2E)

Backend Track (Developer B):
- API development
- Protocol adapter implementation
- Database design + implementation
- WebSocket server
- Testing (unit + integration)

Shared Responsibilities:
- Architecture decisions (both developers)
- Code reviews (cross-review)
- Integration testing (collaboration)
- Deployment pipeline (both)
```

---

## 10. PHASE 2 PREPARATION

### 10.1 Architecture Evolution Plan
```typescript
Week 13-14: Microservices Preparation
- Refactor monolith into clearly separated services
- Implement proper event bus (Redis Streams/Kafka)
- Add InfluxDB per time-series data
- Protocol abstraction completion

Week 15-18: Solar Integration
- Modbus adapter implementation  
- SunSpec protocol support
- Solar inverter discovery
- Energy production monitoring
- Real-time energy flow calculation

Week 19-22: Battery Integration
- Battery management system integration
- Energy storage monitoring
- Smart charge/discharge logic
- Energy optimization algorithms
```

### 10.2 Data Migration Strategy
```typescript
Phase 1 → Phase 2 Migration:
1. Existing device data preservation
2. Energy measurement migration (MongoDB → InfluxDB)
3. User settings expansion (energy preferences)
4. Protocol configuration migration
5. Real-time system migration (polling → event-driven)

Backwards Compatibility:
- API versioning (/v1/, /v2/)
- Progressive feature rollout
- User opt-in per advanced features
- Graceful fallbacks per old devices
```

---

## 11. SUCCESS METRICS & VALIDATION

### 11.1 MVP Success Criteria
```typescript
Technical Metrics:
- 99% uptime durante beta period
- < 3 second device command response time
- 95% device command success rate
- < 1% error rate su funzioni core
- Support per 50+ concurrent users

Business Metrics:
- 100+ beta users entro 30 giorni
- 60% weekly active users
- 4.0+ user satisfaction rating
- 3+ app opens per settimana per user attivo

Future-Ready Validation:
- New protocol integration < 2 settimane
- 10x user scale senza architecture changes
- Energy dashboard components ready
- Time-series pipeline ready per Phase 2
```

### 11.2 Phase 2 Readiness Checklist
- [ ] Protocol abstraction layer tested con mock inverter
- [ ] Event-driven architecture handling 1000+ events/minute
- [ ] Database performance tested con time-series simulation
- [ ] UI components modulari per energy visualization
- [ ] Real-time performance con 100+ dispositivi simulati
- [ ] Microservices boundaries clearly defined
- [ ] Energy data models validated con domain experts
- [ ] Security model scalable per critical energy infrastructure