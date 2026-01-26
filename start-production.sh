#!/bin/bash
set -e

echo "🚀 Starting production server..."

# Check if dist/index.js exists
if [ ! -f "dist/index.js" ]; then
    echo "⚠️  Build files not found. Running build..."
    ./build.sh
fi

# Verify the build exists again
if [ ! -f "dist/index.js" ]; then
    echo "❌ Build failed - dist/index.js not found"
    exit 1
fi

echo "✅ Starting server from dist/index.js..."
NODE_ENV=production node dist/index.js