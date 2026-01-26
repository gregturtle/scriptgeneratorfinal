#!/usr/bin/env node
import { existsSync, cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('Preparing deployment structure...');

// Check if dist/index.js exists
const distIndexPath = join(projectRoot, 'dist', 'index.js');
if (!existsSync(distIndexPath)) {
  console.error('ERROR: dist/index.js not found! Run build first.');
  process.exit(1);
}

// Check if dist/public exists
const distPublicPath = join(projectRoot, 'dist', 'public');
if (!existsSync(distPublicPath)) {
  console.error('ERROR: dist/public not found! Run build first.');
  process.exit(1);
}

// The server expects public files to be at dist/public relative to dist/index.js
// This should already be correct, but let's verify
const indexHtmlPath = join(distPublicPath, 'index.html');
if (!existsSync(indexHtmlPath)) {
  console.error('ERROR: dist/public/index.html not found!');
  process.exit(1);
}

console.log('✓ Server bundle found at dist/index.js');
console.log('✓ Client bundle found at dist/public/');
console.log('✓ index.html found at dist/public/index.html');

// Create uploads directory structure if it doesn't exist (for runtime)
const uploadsPath = join(projectRoot, 'uploads');
if (!existsSync(uploadsPath)) {
  console.log('Creating uploads directory...');
  mkdirSync(uploadsPath, { recursive: true });
}

const backgroundsPath = join(uploadsPath, 'backgrounds');
if (!existsSync(backgroundsPath)) {
  console.log('Creating uploads/backgrounds directory...');
  mkdirSync(backgroundsPath, { recursive: true });
}

const videosPath = join(uploadsPath, 'videos');
if (!existsSync(videosPath)) {
  console.log('Creating uploads/videos directory...');
  mkdirSync(videosPath, { recursive: true });
}

console.log('');
console.log('Deployment preparation complete!');
console.log('Ready to run: NODE_ENV=production node dist/index.js');