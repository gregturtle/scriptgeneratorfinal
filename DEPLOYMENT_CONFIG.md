# Deployment Configuration for Replit

## ✅ WORKING DEPLOYMENT SOLUTION

Due to package.json restrictions, use these wrapper scripts for deployment:

### Option 1: RECOMMENDED - Use deploy-start.js
**Build Command:** `node scripts/build.js`  
**Run Command:** `node deploy-start.js`

### Option 2: Use NPM wrappers
**Build Command:** `node npm-build-wrapper.js`  
**Run Command:** `node npm-start-wrapper.js`

### Option 3: Direct execution
**Build Command:** `npx vite build && npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/index.js`  
**Run Command:** `NODE_ENV=production node dist/index.js`

## Why These Scripts?

The default npm build command uses `--outdir` which creates the server file in the wrong location. Our wrapper scripts use `--outfile=dist/index.js` to ensure the server bundle is created at the correct path.

## Available Scripts

### Core Scripts
- **deploy-start.js** - Complete deployment solution (checks, builds if needed, starts)
- **npm-build-wrapper.js** - Corrected build process for npm run build
- **npm-start-wrapper.js** - Production start with automatic build check

### Build Scripts  
- **scripts/build.js** - Main build script with correct output paths
- **scripts/fix-build.js** - Alternative build script (same functionality)

### Start Scripts
- **start-production.js** - Production wrapper with build verification
- **start-production.sh** - Shell version of production start

## Deployment Steps

1. **In Replit Deployment Settings:**
   - Set Build command: `node scripts/build.js`
   - Set Run command: `node deploy-start.js`

2. **Alternative (if above doesn't work):**
   - Set Build command: `node npm-build-wrapper.js`  
   - Set Run command: `node npm-start-wrapper.js`

3. **Deploy** - The scripts will handle everything automatically

## Verification

After deployment, check:
- Server starts on port 5000
- No "dist/index.js not found" errors
- Application loads correctly

## Build Output Structure

```
dist/
├── index.js          # Server bundle (228 KB) - MUST be here, not dist/index/index.js
└── public/           # Client assets
    ├── index.html
    └── assets/
        ├── index-*.css
        └── index-*.js
```

## Troubleshooting

### "dist/index.js not found"
- The build is using wrong output path
- Solution: Use our wrapper scripts instead of npm commands

### Build succeeds but deployment fails
- Check if dist/index.js exists (not dist/index/index.js)
- Run: `node scripts/build.js` manually to fix

### Manual fix in Shell
```bash
# Clear and rebuild with correct paths
rm -rf dist
node scripts/build.js

# Verify
ls -la dist/

# Start
NODE_ENV=production node dist/index.js
```