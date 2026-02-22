# Stage 1: Builder
FROM node:20-alpine AS builder

# Install build dependencies for native modules (including git and cmake for node-llama-cpp)
RUN apk add --no-cache python3 make g++ git cmake

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

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies (if any)
# better-sqlite3 binaries are copied from builder
RUN apk add --no-cache libstdc++

# Copy artifacts from builder
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
COPY --from=builder /app/mcp.docker.json ./mcp.docker.json
COPY --from=builder /app/persona.json ./persona.json
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/sops ./sops
COPY --from=builder /app/templates ./templates

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

ENTRYPOINT ["./entrypoint.sh"]
