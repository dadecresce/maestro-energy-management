# Maestro Backend Dockerfile
# Multi-stage build for optimized production image

# Development stage
FROM node:18-alpine AS development

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.7.0

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY ../../pnpm-workspace.yaml ./
COPY ../../packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Default command for development
CMD ["pnpm", "run", "dev"]

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.7.0

# Copy package files and workspace configuration
COPY package.json pnpm-lock.yaml* ./
COPY ../../pnpm-workspace.yaml ./
COPY ../../turbo.json ./
COPY ../../packages ./packages

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Remove dev dependencies to reduce size
RUN pnpm prune --prod

# Production stage
FROM node:18-alpine AS production

# Set NODE_ENV
ENV NODE_ENV=production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S maestro -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY --from=builder --chown=maestro:nodejs /app/package.json ./
COPY --from=builder --chown=maestro:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=maestro:nodejs /app/dist ./dist

# Copy shared packages
COPY --from=builder --chown=maestro:nodejs /app/packages ./packages

# Create logs directory
RUN mkdir -p logs && chown maestro:nodejs logs

# Switch to app user
USER maestro

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "dist/index.js"]

# Development with hot reload
FROM development AS dev-hot
CMD ["pnpm", "run", "dev"]

# Testing stage
FROM builder AS test
CMD ["pnpm", "run", "test"]