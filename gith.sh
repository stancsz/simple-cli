#!/bin/bash

# gith.sh
# A wrapper script that ensures the GitHub CLI (gh) is installed
# and then executes the provided command (git, gh, or others).
#
# This wrapper simplifies environment setup in CI/CD or new environments
# by automatically installing 'gh' if missing, which is often needed for
# credential helpers or API interactions, before running the desired command.
#
# Usage:
#   export GITHUB_TOKEN="your_token_here"
#   ./gith.sh <command> [args]
#
# Examples:
#   # Run a git command
#   ./gith.sh git push
#   ./gith.sh git pull origin main
#
#   # Run a gh command
#   ./gith.sh gh auth status
#   ./gith.sh gh pr create --title "My PR" --body "Description"
#
#   # Run any other command with the environment setup
#   ./gith.sh echo "Ready to go!"


set -e

# Ensure GITHUB_TOKEN is available
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set."
    echo "Please export GITHUB_TOKEN='your_token' or ensure it is in your environment."
    exit 1
fi

# Check if gh is installed, if not, install it
if ! type -p gh >/dev/null; then
    echo "GitHub CLI (gh) not found. Installing..."
    
    (type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)) \
    && sudo mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && sudo mkdir -p -m 755 /etc/apt/sources.list.d \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && sudo apt update \
    && sudo apt install gh -y

    echo "GitHub CLI installed successfully."
else
    # echo "GitHub CLI is already installed."
    :
fi

# Configure git to use gh as the credential helper
# This allows 'git push/pull' to use the GITHUB_TOKEN automatically
if command -v gh >/dev/null; then
    gh auth setup-git --hostname github.com
fi

# Execute the command passed as arguments
exec "$@"
