# ================================
# Stage 1: Build Frontend
# ================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies
COPY frontend/package*.json ./
RUN npm ci --retry 3 --network-timeout 30000

# Copy frontend source and build
COPY frontend ./
RUN npm run build

# ================================
# Stage 2: Production
# ================================
FROM node:22-alpine AS production

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
