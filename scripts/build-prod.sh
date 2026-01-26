#!/bin/bash

echo "Starting production build..."

# Clean previous build
echo "Cleaning previous build artifacts..."
rm -rf dist/

# Run the build
echo "Building client with Vite..."
npx vite build

# Check if client build succeeded
if [ ! -d "dist/public" ]; then
  echo "ERROR: Vite build failed - dist/public not created"
  exit 1
fi

echo "Building server with esbuild..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Check if server build succeeded
if [ ! -f "dist/index.js" ]; then
  echo "ERROR: esbuild failed - dist/index.js not created"
  exit 1
fi

# Create necessary runtime directories
echo "Creating runtime directories..."
mkdir -p uploads/backgrounds
mkdir -p uploads/videos

# Verify build output
echo ""
echo "Build verification:"
if [ -f "dist/index.js" ]; then
  echo "✓ Server bundle: dist/index.js ($(du -h dist/index.js | cut -f1))"
else
  echo "✗ Server bundle missing!"
  exit 1
fi

if [ -f "dist/public/index.html" ]; then
  echo "✓ Client bundle: dist/public/index.html"
  echo "✓ Client assets: $(ls dist/public/assets | wc -l) files"
else
  echo "✗ Client bundle missing!"
  exit 1
fi

echo ""
echo "Build completed successfully!"
echo "Total size: $(du -sh dist | cut -f1)"
echo ""
echo "Ready for deployment. Use: NODE_ENV=production node dist/index.js"