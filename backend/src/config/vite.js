/**
 * NoteHubMD Server - Vite SPA Configuration
 * 
 * Serves the Vite-built SPA from frontend/dist.
 * Build the frontend first: cd frontend && npm run build
 */

const path = require('path');
const fs = require('fs');

// Check if Vite build output exists
const viteBuildPath = path.join(__dirname, '../../../frontend/dist');
const hasViteBuild = fs.existsSync(viteBuildPath) && fs.existsSync(path.join(viteBuildPath, 'index.html'));

module.exports = {
    useViteBuild: hasViteBuild,
    viteBuildPath,

    // Express middleware for serving SPA
    spaMiddleware(app, express) {
        if (!hasViteBuild) {
            console.log('[Server] Warning: Vite build not found at:', viteBuildPath);
            return null;
        }

        console.log('[Server] Serving Vite build from:', viteBuildPath);

        // Serve Vite build assets with long cache
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
    }
};
