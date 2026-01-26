#!/usr/bin/env node
import { existsSync } from 'fs';
import { join } from 'path';

// Check if dist/index.js exists
const distIndexPath = join(process.cwd(), 'dist', 'index.js');
const distPublicPath = join(process.cwd(), 'dist', 'public');

console.log('Verifying build output...');

if (!existsSync(distIndexPath)) {
  console.error('ERROR: dist/index.js not found!');
  console.error('Build failed to create server bundle at:', distIndexPath);
  process.exit(1);
}

if (!existsSync(distPublicPath)) {
  console.error('ERROR: dist/public directory not found!');
  console.error('Build failed to create client bundle at:', distPublicPath);
  process.exit(1);
}

// Check if index.html exists in public folder
const indexHtmlPath = join(distPublicPath, 'index.html');
if (!existsSync(indexHtmlPath)) {
  console.error('ERROR: dist/public/index.html not found!');
  process.exit(1);
}

console.log('✓ dist/index.js exists');
console.log('✓ dist/public directory exists');
console.log('✓ dist/public/index.html exists');
console.log('Build verification successful!');