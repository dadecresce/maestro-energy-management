# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an IoT energy management system called "Maestro" - a cloud-first web application for managing Tuya IoT devices. The project aims to create a flowless interface that replaces the Tuya native app with superior web-based control.

## Architecture

**Frontend**: React 18+ with TypeScript
- State Management: React Query
- UI Framework: Material-UI v5  
- Real-time: Socket.io-client
- Charts: Recharts
- PWA capabilities with Service Workers

**Backend**: Node.js with Fastify
- Language: TypeScript
- Authentication: Passport.js with Tuya OAuth
- API Client: Axios with Tuya Cloud API integration
- Caching: Redis for API responses and sessions
- Rate Limiting: Redis-based for Tuya API compliance

**Database**: 
- Primary: PostgreSQL 15
- Cache: Redis 7
- Schema optimized for Tuya devices with JSONB for flexible device capabilities and status

**Infrastructure**: 
- Containerization: Docker with multi-stage builds
- Deployment: Kubernetes or Docker Swarm  
- CDN: CloudFlare
- Monitoring: Prometheus + Grafana
- Logging: Winston + ELK Stack

## Key Integration Points

**Tuya Cloud APIs**:
- Device Management API
- Device Control API  
- Device Status API
- User Management API
- Scene Management API
- Statistics API

**Core Services**:
- `TuyaCloudService`: Main service for Tuya API integration
- OAuth 2.0 flow for seamless authentication
- Real-time WebSocket service for device updates
- Intelligent caching to reduce API calls (30s device status, 5min device list, 1hr user profile)

## Database Schema

Key tables:
- `users`: Tuya user integration with token management
- `devices`: Imported Tuya devices with JSONB capabilities and status
- `device_commands`: Command history for analytics
- `user_preferences`: Dashboard layout and settings

## Development Approach

**Testing**:
- Unit: Jest + Testing Library
- Integration: Tuya Cloud API, database, auth flows
- E2E: Cypress for complete user journeys
- Load testing for 1000+ concurrent users

**Security**:
- OAuth 2.0 with Tuya
- TLS 1.3 for all communications
- Database encryption with key rotation
- GDPR compliance with audit logging

## Performance Requirements

- Device import: < 30 seconds
- Command response: < 3 seconds visual feedback  
- System uptime: > 99%
- API success rate: > 95%

## Development Timeline

6-week MVP approach in sprints:
1. Foundation & Tuya Integration
2. Device Import & Management  
3. Frontend & Real-time Features
4. UX Optimization & Polish
5. Testing & Deployment
6. Launch Preparation

The system is designed to be cloud-first, leveraging Tuya's infrastructure for device compatibility and remote control while providing a superior web-based user experience.