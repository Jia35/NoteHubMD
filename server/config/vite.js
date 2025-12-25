/**
 * NoteHubMD Server - Vite SPA Mode Configuration
 * 
 * This file provides configuration for serving the Vite-built SPA.
 * To use the new Vite frontend instead of the legacy public folder:
 * 1. Build the client: cd client && npm run build
 * 2. Set environment variable: USE_VITE_BUILD=true
 * 3. Restart the server
 */

const path = require('path');
const fs = require('fs');

// Check if Vite build output exists
const viteBuildPath = path.join(__dirname, '../public_dist');
const hasViteBuild = fs.existsSync(viteBuildPath) && fs.existsSync(path.join(viteBuildPath, 'index.html'));

// Determine which frontend to serve
const useViteBuild = process.env.USE_VITE_BUILD === 'true' && hasViteBuild;

module.exports = {
    useViteBuild,
    viteBuildPath,
    legacyPublicPath: path.join(__dirname, '../public'),

    // Get the active public path based on configuration
    getPublicPath() {
        return useViteBuild ? viteBuildPath : this.legacyPublicPath;
    },

    // Express middleware for serving SPA
    spaMiddleware(app, express) {
        const publicPath = this.getPublicPath();

        if (useViteBuild) {
            console.log('[Server] Using Vite build from:', viteBuildPath);

            // Serve Vite build assets
            app.use('/assets', express.static(path.join(viteBuildPath, 'assets'), {
                maxAge: '1y',
                immutable: true
            }));

            // Serve other static files from Vite build
            app.use(express.static(viteBuildPath, {
                maxAge: '6h',
                etag: true
            }));

            // SPA fallback - all non-API routes serve index.html
            return (req, res) => {
                res.sendFile(path.join(viteBuildPath, 'index.html'));
            };
        } else {
            console.log('[Server] Using legacy public folder');

            // Return null to use existing route handlers
            return null;
        }
    }
};
