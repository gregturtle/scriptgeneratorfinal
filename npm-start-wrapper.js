#!/usr/bin/env node
/**
 * NPM Start Wrapper
 * This script ensures the build exists before starting the production server
 * It uses the corrected build process if needed
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distIndexPath = path.join(__dirname, 'dist', 'index.js');

console.log('🚀 Production Start Wrapper');
console.log('===========================');

// Check if dist/index.js exists
if (!existsSync(distIndexPath)) {
    console.log('⚠️  Build not found, running build first...\n');
    
    // Run the correct build script
    const buildProcess = spawn('node', [path.join(__dirname, 'scripts', 'build.js')], { 
        stdio: 'inherit'
    });
    
    buildProcess.on('exit', (code) => {
        if (code === 0 && existsSync(distIndexPath)) {
            console.log('\n✅ Build completed! Starting server...\n');
            startServer();
        } else {
            console.error('\n❌ Build failed. Cannot start server.');
            process.exit(1);
        }
    });
} else {
    console.log('✅ Build found, starting server...\n');
    startServer();
}

function startServer() {
    // Set environment and start server
    process.env.NODE_ENV = 'production';
    
    const serverProcess = spawn('node', ['dist/index.js'], { 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
    });
    
    serverProcess.on('exit', (code) => {
        process.exit(code || 0);
    });
}