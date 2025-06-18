# Maestro Frontend Dockerfile
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
EXPOSE 3000

# Default command for development
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]

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

# Production stage (Nginx)
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]