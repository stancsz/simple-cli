FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY scripts/dashboard/package.json ./
RUN npm install --production

# Copy application files
COPY scripts/dashboard/server.js ./
COPY scripts/dashboard/index.html ./

# Expose port
EXPOSE 3003

# Run the server
CMD ["node", "server.js"]
