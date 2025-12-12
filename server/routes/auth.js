const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models');

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existingUser = await db.User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await db.User.create({
            username,
            password: hashedPassword
        });

        req.session.userId = user.id;
        res.json({ id: user.id, username: user.username });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.User.findOne({ where: { username } });

        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        res.json({ id: user.id, username: user.username });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get Current User
router.get('/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await db.User.findByPk(req.session.userId, {
            attributes: ['id', 'username', 'name', 'avatar', 'pinnedItems']
        });
        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Profile
router.put('/profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await db.User.findByPk(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { name, avatar } = req.body;
        const updateData = {};

        if (name !== undefined) {
            updateData.name = name;
        }
        if (avatar !== undefined) {
            updateData.avatar = avatar;
        }

        await user.update(updateData);
        res.json({
            id: user.id,
            username: user.username,
            name: user.name,
            avatar: user.avatar
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Pinned Items with populated titles
router.get('/pins', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await db.User.findByPk(req.session.userId, {
            attributes: ['pinnedItems']
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const pinnedItems = user.pinnedItems || [];
        const populatedItems = [];

        for (const item of pinnedItems) {
            if (item.type === 'book') {
                const book = await db.Book.findByPk(item.id, {
                    attributes: ['id', 'title'],
                    paranoid: false
                });
                if (book && !book.deletedAt) {
                    populatedItems.push({ type: 'book', id: book.id, title: book.title });
                }
            } else if (item.type === 'note') {
                const note = await db.Note.findByPk(item.id, {
                    attributes: ['id', 'title'],
                    paranoid: false
                });
                if (note && !note.deletedAt) {
                    populatedItems.push({ type: 'note', id: note.id, title: note.title });
                }
            }
        }

        res.json(populatedItems);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add a pinned item
router.post('/pins', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const { type, id } = req.body;
        console.log('[POST /pins] Request:', { type, id, userId: req.session.userId });

        if (!type || !id || !['book', 'note'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type or id' });
        }

        const user = await db.User.findByPk(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('[POST /pins] User pinnedItems before:', user.pinnedItems);

        const pinnedItems = user.pinnedItems || [];
        const existingIndex = pinnedItems.findIndex(p => p.type === type && p.id === id);

        if (existingIndex === -1) {
            pinnedItems.push({ type, id });
            await user.update({ pinnedItems });
            console.log('[POST /pins] Updated pinnedItems:', pinnedItems);
        }

        // Re-fetch to verify
        const updatedUser = await db.User.findByPk(req.session.userId);
        console.log('[POST /pins] User pinnedItems after:', updatedUser.pinnedItems);

        res.json({ success: true, pinnedItems });
    } catch (e) {
        console.error('[POST /pins] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Remove a pinned item
router.delete('/pins/:type/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const { type, id } = req.params;
        if (!type || !id || !['book', 'note'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type or id' });
        }

        const user = await db.User.findByPk(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let pinnedItems = user.pinnedItems || [];
        pinnedItems = pinnedItems.filter(p => !(p.type === type && p.id === id));
        await user.update({ pinnedItems });

        res.json({ success: true, pinnedItems });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

