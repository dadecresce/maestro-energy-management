# Development Environment Setup

## Issues Found and Fixed

1. **Port Configuration**: Fixed port mismatch between backend (.env) and docker-compose.yml
2. **Missing Frontend Dockerfile**: Created frontend Dockerfile
3. **Environment Variables**: Aligned frontend and backend API URLs

## Current Issues

1. **Package Manager**: Project requires pnpm workspaces but pnpm not installed
2. **Docker**: Docker Compose not available on this system

## Manual Development Setup

Since automated setup has dependency issues, here's how to run the dev environment manually:

### Prerequisites
```bash
# Install pnpm globally (if you have permissions)
npm install -g pnpm@8.7.0

# OR use Docker if available
```

### Option 1: With pnpm
```bash
# Install all dependencies
pnpm install

# Start development servers
pnpm run dev
```

### Option 2: Manual setup (current situation)
```bash
# Backend (requires MongoDB and Redis running)
cd apps/backend
npm install  # May need workspace dependency fixes
npm run dev

# Frontend (in separate terminal)
cd apps/frontend  
npm install
npm run dev
```

### Option 3: Docker (recommended)
```bash
# Start infrastructure
docker-compose up -d mongodb redis

# Start services
docker-compose up backend frontend
```

## Database Setup Required

The application needs:
- MongoDB running on port 27017
- Redis running on port 6379

You can start these with Docker:
```bash
docker run -d --name maestro-mongodb -p 27017:27017 mongo:7.0
docker run -d --name maestro-redis -p 6379:6379 redis:7.2-alpine
```