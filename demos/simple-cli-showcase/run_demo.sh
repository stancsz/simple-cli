#!/bin/bash

# Ensure Bun is installed or available
if ! command -v bun &> /dev/null; then
    echo "Bun is required to run this demo."
    exit 1
fi

# Set the working directory to the demo directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || exit 1

# Run the simulation script
echo "Running Showcase Simulation..."
bun run run_demo.ts
