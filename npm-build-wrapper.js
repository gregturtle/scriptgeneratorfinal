#!/usr/bin/env node
/**
 * NPM Build Wrapper
 * This script redirects npm run build to use the correct build script
 * Place this in the root and it can be called by npm run build
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Run the correct build script
const buildProcess = spawn('node', [path.join(__dirname, 'scripts', 'build.js')], { 
    stdio: 'inherit'
});

buildProcess.on('exit', (code) => {
    process.exit(code || 0);
});