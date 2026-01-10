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
        port: getEnv('PORT', 3000)
    },
    session: {
        secret: getEnv('SESSION_SECRET', 'notehubmd-default-secret-change-in-production')
    },
    database: {
        dialect: getEnv('DB_DIALECT', 'postgres'),
        // SQLite options
        storage: getEnv('DB_STORAGE', './database/database.sqlite'),
        // PostgreSQL options
        host: getEnv('DB_HOST', 'localhost'),
        port: getEnv('DB_PORT', 5432),
        username: getEnv('DB_USERNAME', 'postgres'),
        password: getEnv('DB_PASSWORD', ''),
        name: getEnv('DB_NAME', 'notehubmd'),
        logging: getEnv('DB_LOGGING', false)
    },
    defaults: {
        notePermission: getEnv('DEFAULT_NOTE_PERMISSION', 'private'),
        bookPermission: getEnv('DEFAULT_BOOK_PERMISSION', 'private')
    },
    features: {
        comments: getEnv('FEATURE_COMMENTS', true),
        noteReactions: getEnv('FEATURE_NOTE_REACTIONS', true)
    },
    api: {
        masterKey: getEnv('API_MASTER_KEY', '')
    },
    ldap: {
        enabled: getEnv('LDAP_ENABLED', false),
        url: getEnv('LDAP_URL', ''),
        bindDn: getEnv('LDAP_BIND_DN', ''),
        bindPassword: getEnv('LDAP_BIND_PASSWORD', ''),
        searchBase: getEnv('LDAP_SEARCH_BASE', ''),
        searchFilter: getEnv('LDAP_SEARCH_FILTER', '(sAMAccountName={{username}})')
    },
    webhook: {
        commentUrl: getEnv('COMMENT_WEBHOOK_URL', '')
    },
    trash: {
        autoDeleteDays: getEnv('TRASH_AUTO_DELETE_DAYS', 90)
    }
};

// Resolve database storage path to absolute path
if (config.database && config.database.storage) {
    config.database.storage = path.resolve(__dirname, '../../..', config.database.storage);
}

module.exports = config;
