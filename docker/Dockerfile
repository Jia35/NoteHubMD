FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy application code
COPY . .

# Build TailwindCSS
RUN npm run build:css

# Remove dev dependencies for production
RUN npm prune --omit=dev

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
