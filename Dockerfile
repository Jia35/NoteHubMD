FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm ci
RUN cd frontend && npm ci

# Copy application code
COPY backend ./backend
COPY frontend ./frontend
COPY legacy ./legacy

# Build Frontend (Vite)
RUN cd frontend && npm run build

# Remove dev dependencies for production
RUN cd backend && npm prune --omit=dev
# Prune frontend modules as they are compiled
RUN rm -rf frontend/node_modules

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
