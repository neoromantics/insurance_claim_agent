FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Build the Nuxt app
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Set production environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/data.db

# Create directory for SQLite database volume
RUN mkdir -p /app/data

# Run the Nitro server
CMD ["node", ".output/server/index.mjs"]
