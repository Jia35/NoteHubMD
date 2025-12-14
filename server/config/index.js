/**
 * Configuration Loader
 * 
 * Loads configuration from:
 * 1. Default values (hardcoded in this file)
 * 2. .env file (if exists) -> process.env
 * 3. System environment variables -> process.env (always available)
 * 4. config/config.yaml -> parsed and ${ENV_VAR} placeholders replaced
 * 
 * Priority: defaults < config.yaml < environment variables
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Load .env file if it exists (does not override existing env vars)
// If .env doesn't exist, dotenv simply does nothing and system env vars are used
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

/**
 * Default configuration values
 * These are used when config.yaml is missing or incomplete
 */
const defaults = {
    app: {
        version: '1.0.0',
        basePath: '/'
    },
    server: {
        port: 3001
    },
    session: {
        secret: 'notehubmd-default-secret-change-in-production'
    },
    database: {
        dialect: 'sqlite',
        storage: './database/database.sqlite',
        logging: false
    },
    defaults: {
        notePermission: 'private',
        bookPermission: 'private'
    },
    features: {
        comments: true
    },
    api: {
        masterKey: ''  // 預設為空，表示停用 Master API Key 功能
    }
};

/**
 * Deep merge two objects (target wins over source for existing values)
 * @param {object} source - Source object (defaults)
 * @param {object} target - Target object (loaded config)
 * @returns {object} - Merged object
 */
function deepMerge(source, target) {
    const result = { ...source };
    if (target && typeof target === 'object' && !Array.isArray(target)) {
        for (const [key, value] of Object.entries(target)) {
            if (value && typeof value === 'object' && !Array.isArray(value) && source[key]) {
                result[key] = deepMerge(source[key], value);
            } else if (value !== undefined && value !== null && value !== '') {
                result[key] = value;
            }
        }
    }
    return result;
}

/**
 * Recursively replace ${ENV_VAR} placeholders with actual environment variable values
 * @param {any} obj - Object to process
 * @returns {any} - Processed object with env vars interpolated
 */
function interpolateEnvVars(obj) {
    if (typeof obj === 'string') {
        return obj.replace(/\$\{(\w+)\}/g, (match, key) => {
            const value = process.env[key];
            if (value === undefined) {
                console.warn(`[Config] Warning: Environment variable "${key}" is not set, using default`);
                return match; // Keep placeholder, will be handled by deepMerge with defaults
            }
            return value;
        });
    }
    if (Array.isArray(obj)) {
        return obj.map(interpolateEnvVars);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = interpolateEnvVars(value);
        }
        return result;
    }
    return obj;
}

// Path to YAML config file (at project root, same as .env)
const configPath = path.join(__dirname, '../../config.yaml');

// Load YAML config if exists, otherwise use empty object
let yamlConfig = {};
if (fs.existsSync(configPath)) {
    try {
        const configFile = fs.readFileSync(configPath, 'utf8');
        yamlConfig = yaml.load(configFile) || {};
    } catch (e) {
        console.warn(`[Config] Warning: Failed to parse config.yaml: ${e.message}`);
    }
} else {
    console.warn('[Config] Warning: config/config.yaml not found, using defaults');
}

// Interpolate environment variables in YAML config
const interpolatedConfig = interpolateEnvVars(yamlConfig);

// Deep merge: defaults < yamlConfig (interpolated)
const config = deepMerge(defaults, interpolatedConfig);

// Handle unresolved ${} placeholders (use defaults)
if (config.session.secret.includes('${')) {
    config.session.secret = defaults.session.secret;
}

// Allow PORT environment variable to override config
if (process.env.PORT) {
    config.server.port = parseInt(process.env.PORT, 10);
}

// Resolve database storage path to absolute path
if (config.database && config.database.storage) {
    config.database.storage = path.resolve(__dirname, '../..', config.database.storage);
}

module.exports = config;
