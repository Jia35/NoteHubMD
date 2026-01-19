/**
 * Swagger/OpenAPI Configuration
 */

const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./index');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NoteHubMD API',
            version: config.app.version || '1.0.0',
            description: 'NoteHubMD 筆記平台 API 文件\n\n使用方式：在 HTTP 請求中加入以下任一 Header 進行驗證：\n- `X-API-Key: sk-nh-xxx`\n- `Authorization: Bearer sk-nh-xxx`',
            contact: {
                name: 'NoteHubMD'
            }
        },
        servers: [
            {
                url: '/',
                description: '目前伺服器'
            }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: '個人 API Key (格式: sk-nh-xxx)'
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    description: '個人 API Key 作為 Bearer Token'
                }
            }
        },
        security: [
            { ApiKeyAuth: [] },
            { BearerAuth: [] }
        ],
        tags: [
            { name: 'Auth', description: '認證相關 API' },
            { name: 'Notes', description: '筆記管理 API' },
            { name: 'Books', description: '書本管理 API' },
            { name: 'Admin', description: '管理員 API (需要 Admin 權限)' }
        ]
    },
    apis: [
        './src/routes/auth.js',
        './src/routes/api.js',
        './src/routes/admin.js'
    ]
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Filter swagger spec to hide Admin endpoints for non-admin users
 * @param {object} spec - Full OpenAPI spec
 * @param {boolean} isAdmin - Whether the user is an admin
 * @returns {object} - Filtered spec
 */
function filterSpecForUser(spec, isAdmin) {
    if (isAdmin) {
        return spec;
    }

    // Deep clone the spec
    const filtered = JSON.parse(JSON.stringify(spec));

    // Remove Admin tag
    filtered.tags = filtered.tags.filter(tag => tag.name !== 'Admin');

    // Remove paths that belong to Admin tag
    for (const path in filtered.paths) {
        for (const method in filtered.paths[path]) {
            const operation = filtered.paths[path][method];
            if (operation.tags && operation.tags.includes('Admin')) {
                delete filtered.paths[path][method];
            }
        }
        // Remove empty path objects
        if (Object.keys(filtered.paths[path]).length === 0) {
            delete filtered.paths[path];
        }
    }

    return filtered;
}

module.exports = {
    swaggerSpec,
    filterSpecForUser
};
