# Deployment Instructions

## Build Process - FIXED ✅
The application uses a two-step build process:
1. **Vite** builds the client application → `dist/public/`
2. **esbuild** bundles the server → `dist/index.js` (using `--outfile` for correct location)

## File Structure After Build
```
dist/
├── index.js           # Bundled server (0.22 MB)
└── public/            # Client assets
    ├── index.html
    └── assets/        # JS, CSS bundles
```

## Deployment Commands

### For Replit Deployment Settings ⚙️
**Build Command:** `node scripts/build.js`  
**Run Command:** `node deploy-start.js`

### Alternative Commands
```bash
# Option 1: Use NPM wrappers (if changing deployment settings doesn't work)
Build: node npm-build-wrapper.js
Run: node npm-start-wrapper.js

# Option 2: Direct commands
Build: npx vite build && npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/index.js
Run: NODE_ENV=production node dist/index.js
```

### Build Scripts Available
1. **deploy-start.js** - Main deployment entry point that:
   - Checks if build exists
   - Runs the corrected build automatically if needed
   - Starts the production server
   - Uses `--outfile` for correct server bundle location

2. **scripts/fix-build.js** - Standalone build that:
   - Builds client with Vite
   - Builds server with correct `--outfile=dist/index.js`
   - Verifies all outputs exist

3. **start-production.js** - Production wrapper that:
   - Verifies the build output exists
   - Attempts to run build if missing
   - Starts the production server

## Important Notes

1. **Excluded from Deployment**: The following are excluded to reduce deployment size:
   - `uploads/` directory (22GB+ of user files)
   - `node_modules/` (will be rebuilt)
   - Temporary files and logs

2. **Runtime Directories**: The application will create these on first run:
   - `uploads/backgrounds/`
   - `uploads/videos/`

3. **Environment Variables**: Ensure all required environment variables are set in the deployment environment, especially:
   - `META_ACCESS_TOKEN`
   - `DATABASE_URL`
   - `ELEVENLABS_API_KEY`
   - Google service account credentials

## Troubleshooting

### "dist/index.js not found" Error
Run the build manually:
```bash
npm run build
```

### "Could not find the build directory" Error
The client assets should be at `dist/public/`. Verify with:
```bash
ls -la dist/public/
```

### Large Deployment Size Error
Ensure `.replitignore` and `.dockerignore` files are present and exclude:
- `uploads/**`
- `node_modules/**`
- Large CSV files except `server/data/default_primer.csv`