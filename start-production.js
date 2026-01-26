#!/usr/bin/env node
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Production Start Script');
console.log('=======================');

// Check if dist/index.js exists
const distIndexPath = join(__dirname, 'dist', 'index.js');

if (!existsSync(distIndexPath)) {
  console.error('ERROR: dist/index.js not found!');
  console.error('The build has not been run or failed.');
  console.error('Will attempt to run build with corrected output paths...');
  
  // Try to run build with the corrected script
  console.log('\nAttempting to run build now...');
  const buildProcess = spawn('node', ['scripts/fix-build.js'], { 
    stdio: 'inherit',
    shell: true 
  });
  
  buildProcess.on('exit', (code) => {
    if (code === 0 && existsSync(distIndexPath)) {
      console.log('\nBuild completed successfully! Starting server...\n');
      startServer();
    } else {
      console.error('\nBuild failed. Cannot start production server.');
      process.exit(1);
    }
  });
} else {
  // dist/index.js exists, check if public directory exists too
  const distPublicPath = join(__dirname, 'dist', 'public');
  
  if (!existsSync(distPublicPath)) {
    console.error('WARNING: dist/public directory not found!');
    console.error('Client assets may not be available.');
  }
  
  console.log('✓ dist/index.js found');
  console.log('✓ Starting production server...\n');
  startServer();
}

function startServer() {
  // Set NODE_ENV to production
  process.env.NODE_ENV = 'production';
  
  // Start the server
  const serverProcess = spawn('node', ['dist/index.js'], { 
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });
  
  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
  
  serverProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
}