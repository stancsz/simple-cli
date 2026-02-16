#!/bin/sh
set -e

# Load default MCP configuration if not present
if [ ! -f "mcp.json" ]; then
    echo "Using default mcp.docker.json configuration..."
    cp mcp.docker.json mcp.json
fi

# Ensure persona.json is available
if [ ! -f "persona.json" ]; then
    echo "Warning: persona.json not found! Please mount it as a volume."
fi

# Start Brain MCP Server in background
echo "Starting Brain MCP Server..."
# Using node directly on compiled output
node dist/mcp_servers/brain/index.js &
BRAIN_PID=$!

# Wait a moment for Brain server to start
sleep 2

# Start the Agent Daemon (Ghost Mode)
# We run daemon.js directly to keep the container alive and handle signals correctly.
# This corresponds to the "--daemon" flag functionality but without detaching.
echo "Starting Agent Daemon..."
node dist/daemon.js

# If daemon exits, kill Brain server (though container exit kills all)
kill $BRAIN_PID
