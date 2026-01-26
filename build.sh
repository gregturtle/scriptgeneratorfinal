#!/bin/bash
set -e

echo "🔨 Building production bundles..."

# Build client with Vite
echo "📦 Building client..."
npx vite build

# Build server with esbuild, ensuring correct output location
echo "📦 Building server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/index.js

# Verify build outputs
if [ ! -f "dist/index.js" ]; then
    echo "❌ Error: dist/index.js was not created"
    exit 1
fi

if [ ! -d "dist/public" ]; then
    echo "❌ Error: dist/public directory was not created"
    exit 1
fi

echo "✅ Build completed successfully!"
echo "📁 Build outputs:"
ls -la dist/