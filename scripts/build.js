#!/usr/bin/env node
/**
 * Build wrapper script that ensures correct output paths
 * This script is called by npm run build to fix the --outdir vs --outfile issue
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

console.log('🔨 Running production build with correct output paths...');

try {
    // Build client with Vite
    console.log('📦 Building client with Vite...');
    execSync('npx vite build', { 
        stdio: 'inherit',
        cwd: projectRoot 
    });

    // Build server with esbuild using --outfile for correct location
    console.log('\n📦 Building server with esbuild...');
    execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/index.js', { 
        stdio: 'inherit',
        cwd: projectRoot 
    });

    // Verify build outputs
    const distIndexPath = path.join(projectRoot, 'dist', 'index.js');
    const distPublicPath = path.join(projectRoot, 'dist', 'public');

    if (!fs.existsSync(distIndexPath)) {
        throw new Error('dist/index.js was not created');
    }

    if (!fs.existsSync(distPublicPath)) {
        throw new Error('dist/public directory was not created');
    }

    console.log('\n✅ Build completed successfully!');
    console.log('📁 Build outputs verified:');
    
    const indexStats = fs.statSync(distIndexPath);
    console.log(`  ✓ dist/index.js (${(indexStats.size / 1024).toFixed(1)} KB)`);
    
    const publicFiles = fs.readdirSync(distPublicPath);
    console.log(`  ✓ dist/public/ (${publicFiles.length} files)`);
    
    process.exit(0);
} catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
}