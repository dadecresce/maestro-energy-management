# Maestro Backend API

The Maestro Energy Management System backend API server built with Express.js and TypeScript.

## Features

- **RESTful API** with Express.js and TypeScript
- **Authentication & Authorization** with JWT and Tuya OAuth
- **Real-time Communication** with Socket.IO WebSocket
- **Protocol Adapters** for IoT device communication (Tuya, Modbus, MQTT)
- **Database Integration** with MongoDB and Redis caching
- **Comprehensive Logging** with Winston
- **Request Validation** with Joi schemas
- **Error Handling** with custom error classes
- **Health Monitoring** with configurable health checks
- **Rate Limiting** and security middleware
- **Docker Support** with multi-stage builds

## Architecture

```
src/
├── config/          # Configuration management
├── middleware/      # Express middleware
├── routes/          # API route definitions
├── services/        # Business logic services
├── controllers/     # Request handlers
├── models/          # Data models
├── utils/           # Utility functions
└── types/           # TypeScript type definitions
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- MongoDB 6+
- Redis 7+

### Installation

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development server**:
   ```bash
   pnpm run dev
   ```

The API will be available at `http://localhost:3001`

### Docker Development

1. **Start services**:
   ```bash
   # From project root
   docker-compose up -d mongodb redis
   ```

2. **Start backend**:
   ```bash
   pnpm run dev
   ```

### Production Docker

```bash
# Build production image
docker build -t maestro-backend --target production .

# Run container
docker run -p 3001:3001 --env-file .env maestro-backend
```

## API Documentation

### Health Endpoints

- `GET /health` - Basic health check
- `GET /api/v1/health` - Detailed health status
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/live` - Liveness probe

### Authentication Endpoints

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh` - Token refresh
- `GET /api/v1/auth/tuya/login` - Tuya OAuth initiation
- `POST /api/v1/auth/tuya/callback` - Tuya OAuth callback

### User Management Endpoints

- `GET /api/v1/users` - List users (admin)
- `GET /api/v1/users/:id` - Get user profile
- `PUT /api/v1/users/:id` - Update user profile
- `DELETE /api/v1/users/:id` - Delete user account
- `GET /api/v1/users/:id/devices` - Get user's devices
- `GET /api/v1/users/:id/stats` - Get user statistics

### Device Management Endpoints

- `GET /api/v1/devices` - List user's devices
- `POST /api/v1/devices/discover` - Discover new devices
- `POST /api/v1/devices` - Add new device
- `GET /api/v1/devices/:id` - Get device details
- `PUT /api/v1/devices/:id` - Update device configuration
- `DELETE /api/v1/devices/:id` - Remove device
- `POST /api/v1/devices/:id/command` - Send device command
- `GET /api/v1/devices/:id/status` - Get device status
- `GET /api/v1/devices/:id/history` - Get device history
- `POST /api/v1/devices/:id/test` - Test device connectivity

## Configuration

### Environment Variables

See `.env.example` for all available configuration options:

- **Application**: `NODE_ENV`, `PORT`, `HOST`
- **Security**: `JWT_SECRET`, `SESSION_SECRET`
- **Database**: `MONGODB_URI`, `REDIS_URL`
- **Tuya API**: `TUYA_CLIENT_ID`, `TUYA_CLIENT_SECRET`
- **Features**: `WS_ENABLED`, `LOG_LEVEL`, etc.

### Protocol Adapters

The backend integrates with IoT devices through protocol adapters:

- **Tuya Adapter**: Cloud API integration for Tuya devices
- **Modbus Adapter**: Industrial device communication (planned)
- **MQTT Adapter**: IoT messaging protocol support (planned)

## Development

### Scripts

- `pnpm run dev` - Start development server with hot reload
- `pnpm run build` - Build for production
- `pnpm run start` - Start production server
- `pnpm run test` - Run tests
- `pnpm run lint` - Run ESLint
- `pnpm run type-check` - Run TypeScript compiler check

### Code Structure

- **Services**: Core business logic and external integrations
- **Routes**: API endpoint definitions with validation
- **Middleware**: Request processing, authentication, validation
- **Utils**: Helper functions and error handling

### Integration Points

The backend integrates with:

- **@maestro/shared**: Shared types and utilities
- **@maestro/protocol-adapters**: Device communication protocols
- **MongoDB**: Primary data storage
- **Redis**: Caching and session management
- **Socket.IO**: Real-time WebSocket communication

## Monitoring & Observability

### Health Checks

Built-in health monitoring for:
- Database connectivity
- Cache connectivity
- Protocol adapter status
- Memory usage
- System metrics

### Logging

Structured logging with Winston:
- Console output (development)
- File rotation (production)
- Error tracking
- Performance monitoring
- Security events

### Metrics

Basic metrics available at `/api/v1/health/metrics`:
- System uptime
- Memory usage
- CPU usage
- Connection statistics

## Security

### Features

- **JWT Authentication** with refresh tokens
- **Password Security** with bcrypt hashing
- **Rate Limiting** to prevent abuse
- **Input Validation** with Joi schemas
- **CORS Protection** with configurable origins
- **Security Headers** with Helmet
- **Request Size Limits** to prevent DoS

### Best Practices

- Environment-based configuration
- Secure defaults for production
- Error message sanitization
- Audit logging for security events

## Deployment

### Docker

Multi-stage Dockerfile with:
- Development stage with hot reload
- Build stage with optimizations
- Production stage with minimal image
- Security with non-root user

### Kubernetes

Ready for Kubernetes deployment with:
- Health check endpoints
- Graceful shutdown handling
- Environment configuration
- Resource limits support

### Monitoring

Compatible with:
- Prometheus metrics (planned)
- ELK Stack logging
- APM tools integration
- Custom health checks

## Contributing

1. Follow TypeScript and ESLint configurations
2. Add tests for new features
3. Update documentation for API changes
4. Use conventional commit messages
5. Ensure all health checks pass

## License

MIT License - see LICENSE file for details