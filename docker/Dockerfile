FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install all dependencies (including dev for build)
RUN npm ci
RUN cd client && npm ci

# Copy application code
COPY . .

# Build TailwindCSS
RUN npm run build:css

# Build Client (Vite)
RUN npm run client:build

# Remove dev dependencies for production
# Note: We need to be careful not to remove server dependencies needed for runtime
# But usually we prune after build. 
# For client, the build artifacts are static, so we don't need client node_modules in production if we only serve static files
# However, if we are running everything in one container, we might want to prune.
RUN npm prune --omit=dev
# Prune client modules as they are compiled
RUN rm -rf client/node_modules

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
