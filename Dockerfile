FROM node:20-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and config
COPY . .

# Install MCP servers (adding to dependencies so they survive prune)
RUN npm install @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-git

# Build TypeScript
RUN npm run build

# Remove devDependencies
RUN npm prune --production

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

EXPOSE 3002

ENTRYPOINT ["./entrypoint.sh"]
