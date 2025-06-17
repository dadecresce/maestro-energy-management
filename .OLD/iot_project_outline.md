# PROJECT OUTLINE - IoT Energy Management Web App

## 1. SYSTEM ARCHITECTURE

### 1.1 High-Level Components
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Frontend  │────│   Backend API    │────│  Tuya Cloud API │
│   (React PWA)   │    │  (Node.js/Express) │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         v                       v                       v
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  User Interface │    │   Database       │    │  Smart Plugs    │
│  Management     │    │  (MongoDB Atlas) │    │  (IoT Devices)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │
         │                       │
         v                       v
┌─────────────────┐    ┌──────────────────┐
│  Future Energy  │    │  WebSocket       │
│  Systems        │    │  (Real-time)     │
│  (Solar/Battery)│    │                  │
└─────────────────┘    └──────────────────┘
```

### 1.2 Component Interactions
- **Frontend**: Progressive Web App che comunica via REST API e WebSocket
- **Backend**: Orchestrator centrale per business logic, autenticazione e cache
- **Tuya Integration**: Wrapper API per normalizzare comunicazioni con dispositivi
- **Database**: Persistenza configurazioni utente, device metadata, consumption data
- **Real-time Layer**: WebSocket per updates istantanei stato dispositivi

## 2. TECHNOLOGY STACK

### 2.1 Frontend Stack
**Primary**: React 18 + TypeScript + Vite
- **UI Framework**: Material-UI v5 (componenti pronti, accessibilità)
- **State Management**: Zustand (lightweight, TypeScript-friendly)
- **PWA Features**: Workbox (service worker, offline caching)
- **HTTP Client**: Axios con interceptors per auth token management
- **WebSocket**: Socket.io-client per real-time updates

**Justification**: React ecosystem maturo, TypeScript per type safety, Vite per dev experience ottimale, Material-UI per rapid prototyping MVP.

### 2.2 Backend Stack
**Primary**: Node.js + Express + TypeScript
- **Framework**: Express.js con middleware custom per Tuya integration
- **Database ODM**: Mongoose per MongoDB Atlas
- **Authentication**: Passport.js con strategy OAuth2 per Tuya
- **WebSocket**: Socket.io per real-time communication
- **Validation**: Joi per input validation
- **Logging**: Winston con structured logging
- **Process Management**: PM2 per production deployment

**Justification**: JavaScript fullstack per team efficiency, Express per flessibilità, TypeScript per maintainability, Socket.io per real-time requirements.

### 2.3 Infrastructure & DevOps
- **Frontend Hosting**: Vercel (automatic deployments, CDN, PWA support)
- **Backend Hosting**: Railway.app (simple Node.js deployment, auto-scaling)
- **Database**: MongoDB Atlas (managed, automatic backups, global distribution)
- **Monitoring**: Sentry per error tracking, Vercel Analytics
- **CI/CD**: GitHub Actions per automated testing e deployment

## 3. API INTEGRATION

### 3.1 Tuya OpenAPI Integration
```typescript
// Core Tuya API endpoints per MVP
interface TuyaAPIEndpoints {
  // Authentication
  '/v1.0/token': 'POST', // Get access token
  
  // Device Management
  '/v1.0/users/{user_id}/devices': 'GET', // List user devices
  '/v1.0/devices/{device_id}': 'GET', // Get device details
  '/v1.0/devices/{device_id}/commands': 'POST', // Send device command
  '/v1.0/devices/{device_id}/status': 'GET', // Get device status
  
  // Real-time (Pulsar)
  '/v1.0/open-pulsar/access-config': 'GET' // WebSocket config
}
```

### 3.2 Smart Plug Command Interface
```typescript
interface SmartPlugCommands {
  switch_led: boolean;        // On/Off control
  switch_1: boolean;          // Primary switch
  cur_power: number;          // Current power (W)
  cur_voltage: number;        // Current voltage (V) 
  cur_current: number;        // Current amperage (A)
  countdown_1: number;        // Timer countdown (seconds)
}
```

### 3.3 Future Energy Systems APIs
**Solar Inverters** (Phase 2):
- Fronius Solar API, SolarEdge API, Enphase API
- Standard data points: production, grid feed-in, consumption

**Battery Systems** (Phase 3):
- Tesla Powerwall API, LG Chem API, BYD API
- Standard data points: charge level, charge/discharge rate, capacity

## 4. DATA MANAGEMENT

### 4.1 Database Schema (MongoDB)
```typescript
// User Schema
interface User {
  _id: ObjectId;
  tuyaUserId: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
    units: 'metric' | 'imperial';
  };
  createdAt: Date;
  lastLoginAt: Date;
}

// Device Schema
interface Device {
  _id: ObjectId;
  userId: ObjectId;
  tuyaDeviceId: string;
  name: string;              // User-defined name
  category: 'smart_plug';
  specs: {
    model: string;
    manufacturer: string;
    maxPower: number;        // Watts
    hasEnergyMonitoring: boolean;
  };
  location?: {
    room: string;
    coordinates?: [number, number];
  };
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
}

// Energy Consumption Schema
interface EnergyReading {
  _id: ObjectId;
  deviceId: ObjectId;
  timestamp: Date;
  power: number;            // Current power (W)
  voltage: number;          // Voltage (V)
  current: number;          // Current (A)
  energyTotal: number;      // Cumulative energy (kWh)
  cost?: number;            // Calculated cost
}

// Timer/Schedule Schema
interface Timer {
  _id: ObjectId;
  deviceId: ObjectId;
  type: 'countdown' | 'schedule';
  targetState: boolean;     // On/Off
  executeAt: Date;
  isActive: boolean;
  createdAt: Date;
}
```

### 4.2 Database Justification
**MongoDB Atlas** scelto per:
- **Schema Flexibility**: IoT devices hanno specs variabili
- **Horizontal Scaling**: Preparazione per growth futuro
- **Time Series**: Ottimizzato per energy readings con indici temporali
- **Managed Service**: Backup automatici, security patches, monitoring
- **Global Distribution**: Replica sets per latency optimization

## 5. USER INTERFACE

### 5.1 Screen Flow MVP
```
Login Screen
     ↓
Dashboard (Device List)
     ↓
Device Detail Screen
     ↓
Settings/Profile
```

### 5.2 Core UI Components
**Dashboard Screen**:
- Header con user avatar, notifications badge
- Device grid/list con switch toggle, status indicator, power consumption
- Floating Action Button per aggiunta dispositivi
- Bottom navigation: Home, Energy, Settings

**Device Detail Screen**:
- Hero section con device name, status, current power
- Quick controls: On/Off toggle, Timer setter
- Energy consumption chart (daily/weekly)
- Device settings: rename, remove, location

**Settings Screen**:
- User profile management
- App preferences (theme, units)
- Account linking/unlinking
- Privacy policy, terms of service

### 5.3 Mobile-First Design Principles
- **Touch Targets**: Minimum 44px per accessibility
- **Thumb Navigation**: Important actions in bottom 1/3 dello screen
- **Progressive Disclosure**: Informazioni advanced nascoste dietro tap
- **Offline Indicators**: Clear feedback quando non connesso
- **Loading States**: Skeleton screens durante API calls

## 6. SECURITY CONSIDERATIONS

### 6.1 Authentication & Authorization
```typescript
// JWT Token Structure
interface AuthToken {
  sub: string;              // User ID
  tuyaUserId: string;       // Tuya User ID
  iat: number;              // Issued at
  exp: number;              // Expires at
  scope: string[];          // Permissions
}

// OAuth2 Flow con Tuya
1. User → App: Click "Login with Tuya"
2. App → Tuya: Redirect to OAuth consent
3. Tuya → App: Authorization code
4. App → Tuya: Exchange code for access token
5. App → User: JWT token for session management
```

### 6.2 Data Protection
- **Encryption in Transit**: HTTPS/TLS 1.3 per tutte le communications
- **Encryption at Rest**: MongoDB Atlas encryption automatica
- **Token Security**: JWT con short expiration (1h), refresh token (30d)
- **API Rate Limiting**: Express-rate-limit per prevenire abuse
- **Input Sanitization**: Joi validation + MongoDB injection protection

### 6.3 Device Security
- **Command Validation**: Whitelist di comandi supportati
- **Device Ownership**: Verifica userId prima di ogni comando
- **Audit Logging**: Log di tutti i device commands per debugging
- **Secure Headers**: Helmet.js per security headers HTTP

## 7. SCALABILITY & PERFORMANCE

### 7.1 Horizontal Scaling Strategy
```typescript
// Microservices Evolution (Post-MVP)
interface ServiceArchitecture {
  userService: 'Authentication, profiles, preferences';
  deviceService: 'Device management, commands, status';
  energyService: 'Consumption tracking, analytics';
  notificationService: 'Real-time updates, push notifications';
  integrationService: 'Third-party API management';
}
```

### 7.2 Performance Optimizations
**Frontend**:
- **Code Splitting**: React.lazy() per route-based splitting
- **Image Optimization**: WebP format, lazy loading
- **Bundle Analysis**: Webpack Bundle Analyzer per size monitoring
- **Service Worker**: Cache API responses, offline functionality

**Backend**:
- **Redis Cache**: Device status cache per ridurre Tuya API calls
- **Connection Pooling**: MongoDB connection reuse
- **Response Compression**: Gzip middleware per ridurre payload
- **CDN**: Static assets served via Vercel Edge Network

### 7.3 Monitoring & Alerting
- **Application Metrics**: Response times, error rates, throughput
- **Infrastructure Metrics**: CPU, memory, database performance
- **Business Metrics**: Device commands/hour, user engagement
- **Alerting**: Slack/email notifications per critical issues

## 8. TESTING & QUALITY ASSURANCE

### 8.1 Testing Pyramid
```typescript
// Unit Tests (70% coverage target)
- Utils functions (date formatting, calculations)
- React components (rendering, user interactions)
- API middleware (validation, error handling)
- Database models (CRUD operations)

// Integration Tests (20% coverage target)
- API endpoints end-to-end
- Database transactions
- Tuya API integration mocks
- WebSocket communication

// E2E Tests (10% coverage target)
- Critical user journeys (login → device control)
- Cross-browser compatibility
- Mobile responsive testing
- Performance benchmarks
```

### 8.2 Testing Tools & Strategy
**Frontend Testing**:
- **Jest + Testing Library**: Component unit tests
- **Cypress**: E2E testing automation
- **Storybook**: Component visual testing e documentation

**Backend Testing**:
- **Jest + Supertest**: API endpoint testing
- **MongoDB Memory Server**: Database testing isolation
- **Nock**: HTTP mocking per Tuya API calls

### 8.3 Device Testing Protocol
```typescript
// Physical Device Testing Checklist
interface DeviceTestSuite {
  connectivity: {
    initial_pairing: boolean;
    reconnection_after_wifi_loss: boolean;
    command_response_time: number; // < 3 seconds
  };
  
  commands: {
    on_off_toggle: boolean;
    timer_functionality: boolean;
    status_reporting: boolean;
  };
  
  edge_cases: {
    device_offline_handling: boolean;
    network_interruption_recovery: boolean;
    concurrent_user_commands: boolean;
  };
}
```

## 9. FUTURE EXPANSION ROADMAP

### 9.1 Phase 2: Enhanced Smart Home (Weeks 13-26)
**New Features**:
- Device automation rules (if-then logic)
- Energy consumption analytics e insights
- Multi-user household support
- Push notifications

**Technical Additions**:
- Rule engine per automations
- Time-series database optimization
- Push notification service
- Advanced caching strategies

### 9.2 Phase 3: Solar Integration (Weeks 27-39)
**Energy Management Features**:
- Solar inverter connectivity (Fronius, SolarEdge)
- Solar production vs consumption tracking
- Smart switching based on solar availability
- Grid feed-in optimization

**Architecture Evolution**:
```typescript
interface EnergyManagementSystem {
  solarProduction: {
    currentPower: number;      // Watts currently produced
    dailyGeneration: number;   // kWh today
    forecast: number[];        // Next 24h prediction
  };
  
  gridConsumption: {
    importing: number;         // Watts from grid
    exporting: number;         // Watts to grid
    tariff: number;           // Current rate per kWh
  };
  
  smartSwitching: {
    solarAvailableDevices: Device[];
    priorityQueue: Device[];
    autoSwitchEnabled: boolean;
  };
}
```

### 9.3 Phase 4: Battery Storage (Weeks 40-52)
**Advanced Energy Features**:
- Battery charge/discharge management
- Time-of-use optimization
- Emergency backup scenarios
- AI-powered consumption prediction

**AI/ML Integration**:
- TensorFlow.js per consumption pattern learning
- Weather API integration per solar forecasting
- Dynamic pricing optimization algorithms

## 10. PROJECT TIMELINE & MILESTONES

### 10.1 MVP Timeline (12 Weeks)
```
Week 1-2: Foundation Setup
├── Project scaffolding (React + Node.js)
├── Tuya Developer Account + API integration
├── Basic authentication flow
└── Database schema design

Week 3-4: Core Backend
├── User management API
├── Device import from Tuya
├── Device command API
└── WebSocket real-time updates

Week 5-6: Frontend Core
├── Login/Dashboard screens
├── Device list e detail views
├── Basic responsive design
└── API integration

Week 7-8: Device Control
├── On/Off toggle functionality
├── Timer implementation
├── Status monitoring
└── Error handling

Week 9-10: UI/UX Polish
├── Design system implementation
├── Mobile optimization
├── Loading states e feedback
└── Offline mode basics

Week 11: Testing & Bug Fixes
├── Manual testing con device reali
├── Cross-browser testing
├── Performance optimization
└── Security audit

Week 12: Deployment & Launch
├── Production deployment setup
├── Beta user onboarding
├── Monitoring setup
└── Documentation completion
```

### 10.2 Success Metrics per Milestone
**Week 4 Checkpoint**:
- [ ] Successful Tuya API integration
- [ ] User authentication working
- [ ] Device import functional

**Week 8 Checkpoint**:
- [ ] Basic device control operational
- [ ] Real-time status updates working
- [ ] Mobile-responsive interface

**Week 12 Launch**:
- [ ] 95% device command success rate
- [ ] < 3 second response time
- [ ] 5+ beta users onboarded successfully

### 10.3 Risk Mitigation
**Technical Risks**:
- *Tuya API limitations*: Backup plan con local network discovery
- *Real-time performance*: Fallback a polling mechanism
- *Device compatibility*: Test con multiple smart plug models

**Business Risks**:
- *User adoption*: Beta testing program con feedback iterativo
- *Competition*: Focus su superior UX rispetto ad app native
- *Scalability costs*: Monitoring usage patterns per cost optimization

## 11. BUDGET BREAKDOWN (€15k MVP)

### 11.1 Development Costs (€12k)
- **Senior Frontend Developer**: €6k (6 settimane @ €1k/settimana)
- **Senior Backend Developer**: €6k (6 settimane @ €1k/settimana)

### 11.2 Infrastructure & Tools (€2k)
- **Cloud Services**: €500 (MongoDB Atlas, Vercel, Railway)
- **Development Tools**: €300 (licenses, subscriptions)
- **Testing Devices**: €800 (5x smart plugs diversi modelli)
- **Design Resources**: €400 (UI kit, icons, stock images)

### 11.3 Contingency (€1k)
- **Unforeseen Technical Challenges**: €500
- **Additional Testing Requirements**: €300
- **Marketing/Beta Launch**: €200

## 12. SUCCESS DEFINITION

### 12.1 Technical Success Criteria
- **Reliability**: 99% uptime durante beta period
- **Performance**: Device commands executed in < 3 seconds
- **Compatibility**: Funziona su 95% dei smart plug Tuya testati
- **Security**: Zero data breaches o security incidents

### 12.2 Business Success Criteria
- **User Acquisition**: 100+ beta users nei primi 30 giorni
- **Engagement**: 60% users attivi weekly
- **Satisfaction**: 4+ stelle user feedback score
- **Technical Validation**: Foundation solida per Phase 2 expansion

### 12.3 Future Readiness
- **Scalable Architecture**: Support per 1000+ concurrent users
- **Extensible Design**: Easy integration di nuovi device types
- **Data Foundation**: Energy consumption data collection ready
- **User Base**: Community di early adopters per future features