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
            attributes: ['id', 'username', 'name', 'avatar']
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

module.exports = router;

