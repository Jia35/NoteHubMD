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
            attributes: ['id', 'username', 'name', 'avatar', 'role', 'createdAt', 'lastActiveAt'],
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

module.exports = router;
