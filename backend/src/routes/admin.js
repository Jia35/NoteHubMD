const express = require('express');
const router = express.Router();
const db = require('../models');

// Middleware: Check if user is admin
const requireAdmin = async (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await db.User.findByPk(req.session.userId);
    if (!user || (user.role !== 'super-admin' && user.role !== 'admin')) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    req.currentUser = user;
    next();
};

// GET /api/admin/users - List all users with stats
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const users = await db.User.findAll({
            attributes: ['id', 'username', 'name', 'avatar', 'role', 'createdAt', 'lastActiveAt', 'isApiKeyEnabled'],
            order: [['createdAt', 'ASC']]
        });

        // Get book and note counts for each user
        const usersWithStats = await Promise.all(users.map(async (user) => {
            const bookCount = await db.Book.count({ where: { ownerId: user.id } });
            const noteCount = await db.Note.count({ where: { ownerId: user.id } });

            return {
                ...user.toJSON(),
                bookCount,
                noteCount
            };
        }));

        res.json(usersWithStats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/stats - Get notes and books statistics
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        // Get online users count from socket module
        const { getActiveConnectionsCount } = require('../index');
        const onlineUsers = getActiveConnectionsCount();

        // Active counts (not in trash, not system)
        const booksCount = await db.Book.count({ where: { isSystem: false } });
        const standaloneNotesCount = await db.Note.count({ where: { bookId: null, isSystem: false } });
        const totalNotesCount = await db.Note.count({ where: { isSystem: false } });

        // Trash counts (deletedAt is not null)
        const trashedBooksCount = await db.Book.count({
            where: { deletedAt: { [db.Sequelize.Op.ne]: null } },
            paranoid: false
        });
        const trashedStandaloneNotesCount = await db.Note.count({
            where: {
                bookId: null,
                deletedAt: { [db.Sequelize.Op.ne]: null }
            },
            paranoid: false
        });
        const trashedTotalNotesCount = await db.Note.count({
            where: { deletedAt: { [db.Sequelize.Op.ne]: null } },
            paranoid: false
        });

        res.json({
            onlineUsers,
            active: {
                books: booksCount,
                standaloneNotes: standaloneNotesCount,
                totalNotes: totalNotesCount
            },
            trash: {
                books: trashedBooksCount,
                standaloneNotes: trashedStandaloneNotesCount,
                totalNotes: trashedTotalNotesCount
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        // Validate role
        if (!role || !['super-admin', 'admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Find target user
        const targetUser = await db.User.findByPk(id);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentUser = req.currentUser;

        // Permission checks
        // 1. Cannot change own role
        if (targetUser.id === currentUser.id) {
            return res.status(403).json({ error: 'Cannot change your own role' });
        }

        // 2. Admin cannot change super-admin's role
        if (targetUser.role === 'super-admin' && currentUser.role !== 'super-admin') {
            return res.status(403).json({ error: 'Cannot modify super-admin' });
        }

        // 3. Admin cannot set someone as super-admin
        if (role === 'super-admin' && currentUser.role !== 'super-admin') {
            return res.status(403).json({ error: 'Only super-admin can assign super-admin role' });
        }

        await targetUser.update({ role });

        res.json({
            id: targetUser.id,
            username: targetUser.username,
            role: targetUser.role
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/users/:id/apikey - Toggle user API Key feature
router.put('/users/:id/apikey', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }

        const targetUser = await db.User.findByPk(id);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If disabling, also clear the API key
        const updateData = { isApiKeyEnabled: enabled };
        if (!enabled) {
            updateData.apiKey = null;
        }

        await targetUser.update(updateData);

        res.json({
            id: targetUser.id,
            username: targetUser.username,
            isApiKeyEnabled: targetUser.isApiKeyEnabled
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/system - Get system configuration status
router.get('/system', requireAdmin, async (req, res) => {
    try {
        const config = require('../config');

        // Check if env vars are explicitly set
        const isEnvSet = (key) => process.env[key] !== undefined && process.env[key] !== '';

        res.json({
            features: {
                comments: {
                    value: config.features?.comments !== false,
                    isSet: isEnvSet('FEATURE_COMMENTS'),
                    default: true
                },
                noteReactions: {
                    value: config.features?.noteReactions !== false,
                    isSet: isEnvSet('FEATURE_NOTE_REACTIONS'),
                    default: true
                }
            },
            defaults: {
                notePermission: {
                    value: config.defaults?.notePermission || 'private',
                    isSet: isEnvSet('DEFAULT_NOTE_PERMISSION'),
                    default: 'private'
                },
                bookPermission: {
                    value: config.defaults?.bookPermission || 'private',
                    isSet: isEnvSet('DEFAULT_BOOK_PERMISSION'),
                    default: 'private'
                }
            },
            webhook: {
                commentUrl: config.webhook?.commentUrl || null
            },
            ldap: {
                enabled: config.ldap?.enabled || false
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/storage - Get storage statistics
router.get('/storage', requireAdmin, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const config = require('../config');

        // Get uploads directory stats
        const uploadsDir = path.join(__dirname, '../../../_uploads');
        let uploadStats = { count: 0, size: 0 };

        if (fs.existsSync(uploadsDir)) {
            const getAllFiles = (dirPath, files = []) => {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        getAllFiles(fullPath, files);
                    } else {
                        try {
                            const stat = fs.statSync(fullPath);
                            files.push({ path: fullPath, size: stat.size });
                        } catch (e) {
                            // Skip files that can't be accessed
                        }
                    }
                }
                return files;
            };

            const files = getAllFiles(uploadsDir);
            uploadStats.count = files.length;
            uploadStats.size = files.reduce((sum, f) => sum + f.size, 0);
        }

        // Get database size
        let dbStats = { type: config.database.dialect, size: null };

        if (config.database.dialect === 'sqlite') {
            const dbPath = config.database.storage;
            if (fs.existsSync(dbPath)) {
                const stat = fs.statSync(dbPath);
                dbStats.size = stat.size;
            }
        } else if (config.database.dialect === 'postgres') {
            // For PostgreSQL, query database size
            try {
                const result = await db.sequelize.query(
                    "SELECT pg_database_size(current_database()) as size",
                    { type: db.Sequelize.QueryTypes.SELECT }
                );
                dbStats.size = result[0]?.size || null;
            } catch (e) {
                // Failed to get pg size, leave as null
            }
        }

        // Get per-user upload stats (from database if available, or estimate from folder structure)
        const userUploads = [];
        const users = await db.User.findAll({ attributes: ['id', 'username', 'name'] });

        for (const user of users) {
            const userDir = path.join(uploadsDir, user.username);
            if (fs.existsSync(userDir)) {
                const files = [];
                const getFilesInDir = (dirPath) => {
                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dirPath, entry.name);
                        if (entry.isDirectory()) {
                            getFilesInDir(fullPath);
                        } else {
                            try {
                                const stat = fs.statSync(fullPath);
                                files.push(stat.size);
                            } catch (e) { }
                        }
                    }
                };
                getFilesInDir(userDir);

                if (files.length > 0) {
                    userUploads.push({
                        userId: user.id,
                        username: user.username,
                        name: user.name || user.username,
                        count: files.length,
                        size: files.reduce((sum, s) => sum + s, 0)
                    });
                }
            }
        }

        // Sort by size descending
        userUploads.sort((a, b) => b.size - a.size);

        res.json({
            uploads: uploadStats,
            database: dbStats,
            userUploads
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

