#!/usr/bin/env node
/**
 * Deployment Start Script
 * This script is used as the main entry point for production deployment.
 * It ensures the build exists and starts the server correctly.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Deployment Start Script');
console.log('===========================');

const distIndexPath = join(__dirname, 'dist', 'index.js');
const distPublicPath = join(__dirname, 'dist', 'public');

// Function to run the corrected build
function runBuild() {
    console.log('\n⚠️  Build files not found. Running build...\n');
    
    try {
        // Run the build with the corrected output path
        console.log('📦 Building client...');
        execSync('npx vite build', { 
            stdio: 'inherit',
            cwd: __dirname 
        });
        
        console.log('\n📦 Building server...');
        // Use --outfile instead of --outdir to ensure correct output location
        execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/index.js', { 
            stdio: 'inherit',
            cwd: __dirname 
        });
        
        console.log('\n✅ Build completed successfully!\n');
        return true;
    } catch (error) {
        console.error('❌ Build failed:', error.message);
        return false;
    }
}

// Check if build exists
if (!existsSync(distIndexPath)) {
    if (!runBuild()) {
        console.error('\n❌ Cannot start server - build failed');
        process.exit(1);
    }
}

// Verify build outputs
if (!existsSync(distIndexPath)) {
    console.error('❌ Error: dist/index.js still not found after build');
    process.exit(1);
}

if (!existsSync(distPublicPath)) {
    console.warn('⚠️  Warning: dist/public directory not found - client assets may not be available');
}

console.log('✅ Build verified');
console.log('✅ Starting production server...\n');

// Set environment and start server
process.env.NODE_ENV = 'production';

// Import and run the server
import(distIndexPath).then(() => {
    console.log('Server started successfully');
}).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});