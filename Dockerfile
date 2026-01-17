# Use Node.js 22 Slim (Debian-based)
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install build dependencies for native modules (python3, make, g++, openssl)
RUN apt-get update && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma Client
# We need a dummy DATABASE_URL for generation, but it shouldn't persist in the image if possible.
# Using ARG would be better but requires passing build-arg.
# For now, we will override it at runtime with docker-compose.
ENV DATABASE_URL="file:./dev.db"
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Start command
CMD ["npm", "start"]
