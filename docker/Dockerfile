FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production

# Copy application code
COPY . .

# Build TailwindCSS
RUN npm run build:css

# Expose port
EXPOSE 3001

# Start command
CMD ["npm", "start"]
