/**
 * API Key Authentication Middleware
 * 
 * Checks for a valid API Key in the request.
 * Supports both Master API Key and Personal User API Keys.
 * 
 * Master API Key: Full access, bypasses all permission checks.
 * Personal API Key: Acts as the user who owns the key.
 * 
 * API Key can be provided via:
 * - Header: X-API-Key
 * - Header: Authorization: Bearer <API_KEY>
 * - Query parameter: apiKey
 */

const config = require('../config');
const db = require('../models');

module.exports = async (req, res, next) => {
    req.isMasterApiKey = false;
    req.isUserApiKey = false;

    // Get API key from request (X-API-Key header takes priority, then Authorization Bearer, then query)
    let providedKey = req.headers['x-api-key'];

    if (!providedKey) {
        // Check Authorization: Bearer header
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            providedKey = authHeader.substring(7); // Remove 'Bearer ' prefix
        }
    }

    if (!providedKey) {
        providedKey = req.query.apiKey;
    }

    if (!providedKey) {
        return next();
    }

    // Check Master API Key first
    const masterKey = config.api?.masterKey;
    if (masterKey && !masterKey.includes('${') && providedKey === masterKey) {
        req.isMasterApiKey = true;
        return next();
    }

    // Check Personal User API Key
    try {
        const user = await db.User.findOne({
            where: {
                apiKey: providedKey,
                isApiKeyEnabled: true
            }
        });

        if (user) {
            // Simulate login session for the user
            req.session.userId = user.id;
            req.isUserApiKey = true;
            // Update last active time
            user.update({ lastActiveAt: new Date() }).catch(() => { });
        }
    } catch (e) {
        console.error('[apiKeyAuth] Error checking user API key:', e.message);
    }

    next();
};
