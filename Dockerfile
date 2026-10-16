FROM node:20-alpine

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Build Vite frontend assets to dist/
RUN npm run build

# Cloud Run environment settings
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
