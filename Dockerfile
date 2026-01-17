# ================================
# Stage 1: Build Frontend
# ================================
# Use slim (Debian-based) instead of alpine to fix lightningcss/esbuild native binary issues
FROM node:22-slim AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
# Clear cache and retry to avoid ETXTBSY error with esbuild on Alpine
RUN npm cache clean --force && \
    npm ci --retry 3 --network-timeout 30000 || \
    (sleep 2 && npm ci --retry 3 --network-timeout 30000)

# Copy frontend source and build
COPY frontend ./
RUN npm run build

# ================================
# Stage 2: Production
# ================================
FROM node:22-slim AS production

WORKDIR /app

# Install backend dependencies only (production)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source
COPY backend ./backend

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "--prefix", "backend", "start"]
