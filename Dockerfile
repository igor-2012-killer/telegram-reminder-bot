FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Start command
CMD ["npm", "start"]
