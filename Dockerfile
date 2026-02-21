# Stage 1: Builder
FROM node:22-alpine AS builder

# Install build dependencies for native modules
# git, cmake, linux-headers required for node-llama-cpp build
RUN apk add --no-cache python3 make g++ git cmake linux-headers

WORKDIR /app

COPY package.json package-lock.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and config
COPY . .

# Build TypeScript
RUN npm run build

# Compile Showcase Demo (run_demo.ts -> run_demo.js)
# We need to compile it because the runner image doesn't have src/ or ts-node.
# We also rewrite imports from ../../src/ to ../../dist/ so it runs against compiled code.
RUN npx tsc demos/simple-cli-showcase/run_demo.ts \
    --target es2022 \
    --module esnext \
    --moduleResolution node \
    --esModuleInterop \
    --skipLibCheck \
    --allowSyntheticDefaultImports
RUN sed -i 's|../../src/|../../dist/|g' demos/simple-cli-showcase/run_demo.js

# Remove devDependencies
RUN npm prune --production

# Stage 2: Runner
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies (if any)
# better-sqlite3 binaries are copied from builder
# git: required for simple-git and SOPs
# curl: useful for SOPs
RUN apk add --no-cache libstdc++ git curl

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
COPY --from=builder /app/demos ./demos

# Ensure entrypoint is executable
RUN chmod +x entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

ENTRYPOINT ["./entrypoint.sh"]
