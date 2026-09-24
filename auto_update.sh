#!/bin/bash

# Determine the absolute path of the script's directory
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$REPO_DIR"

# Fetch the latest changes
git fetch origin main

# Compare local head to remote head
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] New updates found! Pulling code..."
    git reset --hard origin/main
    
    echo "[$(date)] Rebuilding and restarting Docker containers..."
    # Build and restart detached
    docker compose up -d --build
    
    echo "[$(date)] Update complete!"
else
    # Uncomment for debugging: echo "[$(date)] Already up to date."
    pass=1
fi
