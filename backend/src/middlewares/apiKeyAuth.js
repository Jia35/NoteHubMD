/**
 * API Key Authentication Middleware
 * 
 * Checks for a valid Master API Key in the request.
 * If a valid key is provided, sets req.isMasterApiKey = true
 * allowing the request to bypass authentication checks.
 * 
 * API Key can be provided via:
 * - Header: X-API-Key
 * - Query parameter: apiKey
 */

const config = require('../config');

module.exports = (req, res, next) => {
    req.isMasterApiKey = false;

    // Get master key from config
    const masterKey = config.api?.masterKey;

    // If no master key configured (empty or contains unresolved placeholder), skip
    if (!masterKey || masterKey.includes('${')) {
        return next();
    }

    // Get API key from request (header takes priority)
    const providedKey = req.headers['x-api-key'] || req.query.apiKey;

    // Check if provided key matches master key
    if (providedKey && providedKey === masterKey) {
        req.isMasterApiKey = true;
    }

    next();
};
