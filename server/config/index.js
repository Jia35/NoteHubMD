/**
 * Configuration Loader
 * 
 * Loads configuration from:
 * 1. Default values (hardcoded in this file)
 * 2. .env file (if exists) -> process.env
 * 3. System environment variables -> process.env (always available)
 * 
 * All configuration is now done via environment variables.
 * config.yaml is no longer used.
 */

const path = require('path');

// Load .env file if it exists (does not override existing env vars)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

/**
 * Get environment variable with type conversion
 */
function getEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined || value === '') {
        return defaultValue;
    }

    // Auto-convert types based on default value type
    if (typeof defaultValue === 'boolean') {
        return value.toLowerCase() === 'true' || value === '1';
    }
    if (typeof defaultValue === 'number') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }
    return value;
}

/**
 * Configuration object built from environment variables
 */
const config = {
    app: {
        version: getEnv('APP_VERSION', '0.0.1 beta'),
        basePath: getEnv('APP_BASE_PATH', '/')
    },
    server: {
        port: getEnv('PORT', 3001)
    },
    session: {
        secret: getEnv('SESSION_SECRET', 'notehubmd-default-secret-change-in-production')
    },
    database: {
        dialect: getEnv('DB_DIALECT', 'sqlite'),
        storage: getEnv('DB_STORAGE', './database/database.sqlite'),
        logging: getEnv('DB_LOGGING', false)
    },
    defaults: {
        notePermission: getEnv('DEFAULT_NOTE_PERMISSION', 'private'),
        bookPermission: getEnv('DEFAULT_BOOK_PERMISSION', 'private')
    },
    features: {
        comments: getEnv('FEATURE_COMMENTS', true)
    },
    api: {
        masterKey: getEnv('API_MASTER_KEY', '')
    }
};

// Resolve database storage path to absolute path
if (config.database && config.database.storage) {
    config.database.storage = path.resolve(__dirname, '../..', config.database.storage);
}

module.exports = config;
