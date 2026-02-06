FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

# Install git for git tools
RUN apk add --no-cache git

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist
COPY skills ./skills
COPY tools ./tools
COPY examples ./examples

# Link command
RUN npm link

# Environment variables
ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["simple"]
CMD ["--help"]
