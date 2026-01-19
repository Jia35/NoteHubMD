const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models');
const config = require('../config');
const { generateApiKey } = require('../utils/idGenerator');

// LDAP client (lazy loaded)
let ldap = null;
if (config.ldap.enabled) {
    ldap = require('ldapjs');
}

/**
 * Authenticate user via LDAP
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<{success: boolean, error?: string, displayName?: string}>}
 */
async function ldapAuthenticate(username, password) {
    return new Promise((resolve) => {
        const client = ldap.createClient({
            url: config.ldap.url,
            connectTimeout: 5000,
            timeout: 5000
        });

        client.on('error', (err) => {
            console.error('[LDAP] Client error:', err.message);
            resolve({ success: false, error: 'LDAP 連線失敗' });
        });

        // First, bind with admin credentials to search for user
        client.bind(config.ldap.bindDn, config.ldap.bindPassword, (bindErr) => {
            if (bindErr) {
                console.error('[LDAP] Admin bind failed:', bindErr.message);
                client.destroy();
                return resolve({ success: false, error: 'LDAP 認證服務錯誤' });
            }

            // Search for user DN
            const searchFilter = config.ldap.searchFilter.replace('{{username}}', username);
            const searchOptions = {
                filter: searchFilter,
                scope: 'sub',
                attributes: ['dn', 'displayName', 'cn', 'sAMAccountName']
            };

            client.search(config.ldap.searchBase, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    console.error('[LDAP] Search error:', searchErr.message);
                    client.destroy();
                    return resolve({ success: false, error: 'LDAP 搜尋失敗' });
                }

                let userDn = null;
                let displayName = null;

                searchRes.on('searchEntry', (entry) => {
                    userDn = entry.dn.toString();
                    // Try to get display name from various attributes
                    const attrs = entry.pojo?.attributes || [];
                    for (const attr of attrs) {
                        if (attr.type === 'displayName' && attr.values?.[0]) {
                            displayName = attr.values[0];
                            break;
                        }
                        if (attr.type === 'cn' && attr.values?.[0] && !displayName) {
                            displayName = attr.values[0];
                        }
                    }
                });

                searchRes.on('error', (err) => {
                    console.error('[LDAP] Search result error:', err.message);
                    client.destroy();
                    resolve({ success: false, error: 'LDAP 搜尋錯誤' });
                });

                searchRes.on('end', () => {
                    if (!userDn) {
                        client.destroy();
                        return resolve({ success: false, error: '帳號或密碼錯誤' });
                    }

                    // Now bind as the user to verify password
                    const userClient = ldap.createClient({
                        url: config.ldap.url,
                        connectTimeout: 5000,
                        timeout: 5000
                    });

                    userClient.on('error', () => {
                        resolve({ success: false, error: '帳號或密碼錯誤' });
                    });

                    userClient.bind(userDn, password, (userBindErr) => {
                        userClient.destroy();
                        client.destroy();

                        if (userBindErr) {
                            return resolve({ success: false, error: '帳號或密碼錯誤' });
                        }

                        resolve({ success: true, displayName });
                    });
                });
            });
        });
    });
}

// Get auth configuration (for frontend)
router.get('/config', (req, res) => {
    res.json({
        ldapEnabled: config.ldap.enabled
    });
});

// Register
router.post('/register', async (req, res) => {
    // Disable registration in LDAP mode
    if (config.ldap.enabled) {
        return res.status(403).json({ error: 'LDAP 模式下不開放註冊' });
    }

    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existingUser = await db.User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // First user becomes super-admin
        const userCount = await db.User.count();
        const role = userCount === 0 ? 'super-admin' : 'user';

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await db.User.create({
            username,
            password: hashedPassword,
            role,
            lastActiveAt: new Date()
        });

        req.session.userId = user.id;
        res.json({ id: user.id, username: user.username, role: user.role });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (config.ldap.enabled) {
            // LDAP authentication
            const ldapResult = await ldapAuthenticate(username, password);

            if (!ldapResult.success) {
                return res.status(401).json({ error: ldapResult.error });
            }

            // Find or create local user
            let user = await db.User.findOne({ where: { username } });

            if (!user) {
                // First user becomes super-admin
                const userCount = await db.User.count();
                const role = userCount === 0 ? 'super-admin' : 'user';

                user = await db.User.create({
                    username,
                    password: '', // No password stored for LDAP users
                    name: ldapResult.displayName || username,
                    role,
                    lastActiveAt: new Date()
                });
            } else {
                // Update last active time and optionally name
                const updateData = { lastActiveAt: new Date() };
                if (ldapResult.displayName && !user.name) {
                    updateData.name = ldapResult.displayName;
                }
                await user.update(updateData);
            }

            req.session.userId = user.id;
            res.json({ id: user.id, username: user.username, role: user.role });
        } else {
            // Local authentication
            const user = await db.User.findOne({ where: { username } });

            if (!user || !await bcrypt.compare(password, user.password)) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Update last active time
            await user.update({ lastActiveAt: new Date() });

            req.session.userId = user.id;
            res.json({ id: user.id, username: user.username, role: user.role });
        }
    } catch (e) {
        console.error('[Login] Error:', e);
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
            attributes: ['id', 'username', 'name', 'avatar', 'avatarOriginal', 'avatarCropData', 'pinnedItems', 'role', 'isApiKeyEnabled', 'apiKey']
        });
        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: 'User not found' });
        }
        // Update last active time
        await user.update({ lastActiveAt: new Date() });
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

        const { name, avatar, avatarOriginal, avatarCropData } = req.body;
        const updateData = {};

        if (name !== undefined) {
            updateData.name = name;
        }
        if (avatar !== undefined) {
            updateData.avatar = avatar;
        }
        if (avatarOriginal !== undefined) {
            updateData.avatarOriginal = avatarOriginal;
        }
        if (avatarCropData !== undefined) {
            updateData.avatarCropData = avatarCropData;
        }

        await user.update(updateData);
        res.json({
            id: user.id,
            username: user.username,
            name: user.name,
            avatar: user.avatar,
            avatarOriginal: user.avatarOriginal,
            avatarCropData: user.avatarCropData
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

// Generate or Regenerate User API Key
router.post('/apikey', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await db.User.findByPk(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user has API Key feature enabled
        if (!user.isApiKeyEnabled) {
            return res.status(403).json({ error: 'API Key feature is not enabled for your account' });
        }

        // Generate new API key
        const newApiKey = generateApiKey();
        await user.update({ apiKey: newApiKey });

        res.json({ apiKey: newApiKey });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete User API Key
router.delete('/apikey', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const user = await db.User.findByPk(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await user.update({ apiKey: null });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
