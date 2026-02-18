#!/bin/bash
set -e

# setup_dify.sh
# Sets up Dify locally in a .dify directory.

DIFY_DIR=".dify"
REPO_URL="https://github.com/langgenius/dify.git"

echo "=== Simple CLI: Dify Setup ==="

# Check for Docker and Docker Compose
if ! command -v docker &> /dev/null; then
    echo "Error: docker is not installed."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "Error: docker compose is not available."
    exit 1
fi

# Clone Dify if not already present
if [ -d "$DIFY_DIR" ]; then
    echo "Dify directory ($DIFY_DIR) already exists. Updating..."
    cd "$DIFY_DIR"
    git pull
else
    echo "Cloning Dify from $REPO_URL..."
    git clone "$REPO_URL" "$DIFY_DIR"
    cd "$DIFY_DIR"
fi

# Configure environment
cd docker
if [ ! -f .env ]; then
    echo "Creating .env configuration..."
    cp .env.example .env
    # Optional: Customize ports if needed here
    # sed -i 's/EXPOSE_NGINX_PORT=80/EXPOSE_NGINX_PORT=8080/g' .env
else
    echo ".env configuration already exists."
fi

echo ""
echo "=== Setup Complete ==="
echo "To start Dify, run the following commands:"
echo ""
echo "  cd $DIFY_DIR/docker"
echo "  docker compose up -d"
echo ""
echo "Once started, access Dify at http://localhost/install"
echo "Follow docs/DIFY_SETUP.md for agent configuration instructions."
