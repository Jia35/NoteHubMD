const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../models');
const config = require('../config');
const { generateId } = require('../utils/idGenerator');

// --- App Info ---
router.get('/version', (req, res) => {
    res.json({ version: config.app.version });
});

// --- Image Upload ---

// Configure multer storage
const uploadDir = path.join(__dirname, '../../_uploads');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const now = new Date();
        const yyyyMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const random5 = generateId(5); // 5-character Base32 string
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${yyyyMM}_${random5}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});

// Image upload endpoint
router.post('/upload/image', upload.single('image'), (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Login required' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `/_uploads/${req.file.filename}`;
    res.json({ url: imageUrl, filename: req.file.filename });
});

// --- Avatar Upload ---

// Configure multer storage for avatars
const avatarUploadDir = path.join(__dirname, '../../_uploads/avatars');
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(avatarUploadDir)) {
            fs.mkdirSync(avatarUploadDir, { recursive: true });
        }
        cb(null, avatarUploadDir);
    },
    filename: (req, file, cb) => {
        const userId = req.session.userId || 'guest';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${userId}_${timestamp}${ext}`;
        cb(null, filename);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB for avatars
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});

// Avatar upload endpoint
router.post('/upload/avatar', avatarUpload.single('avatar'), (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Login required' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const avatarUrl = `/_uploads/avatars/${req.file.filename}`;
    res.json({ url: avatarUrl, filename: req.file.filename });
});


// Parse tags from markdown content
// Supports: ###### tags: `tag1` `tag2` or ###### tags: `tag1`、`tag2`
function parseTags(content) {
    if (!content) return [];
    const match = content.match(/^#{1,6}\s*tags:\s*(.+)$/im);
    if (!match) return [];

    // Extract content inside backticks
    const tagMatches = match[1].match(/`([^`]+)`/g);
    if (!tagMatches) return [];

    return tagMatches.map(t => t.replace(/`/g, '').trim()).filter(Boolean);
}

// --- Users ---

// Search Users (for permission assignment)
router.get('/users/search', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Login required' });
    }
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const { Op } = db.Sequelize;
        const users = await db.User.findAll({
            where: {
                [Op.or]: [
                    { username: { [Op.like]: `%${q}%` } },
                    { name: { [Op.like]: `%${q}%` } }
                ]
            },
            attributes: ['id', 'username', 'name', 'avatar'],
            limit: 10
        });

        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Notes ---

// Create Note
router.post('/notes', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Login required' });
    }
    let id = generateId();
    let retry = 0;
    while (retry < 5) {
        try {
            const note = await db.Note.create({
                id: id,
                title: (req.body && req.body.title) || 'Untitled Note',
                content: (req.body && req.body.content) || '',
                ownerId: req.session.userId || null
            });
            return res.json(note);
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                id = generateId();
                retry++;
            } else {
                return res.status(500).json({ error: e.message });
            }
        }
    }
    res.status(500).json({ error: 'Failed to generate unique ID' });
});

// Get Note
router.get('/notes/:id', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id, {
            include: [
                {
                    model: db.Book,
                    attributes: ['id', 'title'],
                    include: [
                        { model: db.Note, attributes: ['id', 'title', 'order'], order: [['order', 'ASC']] }
                    ]
                },
                { model: db.User, as: 'owner', attributes: ['id', 'username', 'name', 'avatar'] },
                { model: db.User, as: 'lastEditor', attributes: ['id', 'username', 'name', 'avatar'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username', 'name', 'avatar'] }
            ]
        });
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Resolve effective permission (handle 'inherit' from book)
        const effectivePermission = await resolveNotePermission(note);

        // Check user-specific permission override
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Permission check
        if (effectivePermission === 'private') {
            if (!isOwner && !userPermOverride) {
                // If not logged in, prompt to login (they might be the owner)
                if (!userId) {
                    return res.status(401).json({ error: 'Login required' });
                }
                // Logged in but not owner and no override - access denied
                return res.status(403).json({ error: 'Access denied' });
            }
        } else if (effectivePermission === 'auth-view' || effectivePermission === 'auth-edit') {
            if (!userId) {
                return res.status(401).json({ error: 'Login required' });
            }
        }
        // public-view and public-edit allow anyone

        // Determine if user can edit
        let canEdit = false;
        if (isOwner) {
            canEdit = true;
        } else if (userPermOverride === 'edit') {
            canEdit = true;
        } else if (effectivePermission === 'public-edit') {
            canEdit = true;
        } else if (effectivePermission === 'auth-edit' && userId) {
            canEdit = true;
        }

        res.json({
            ...note.toJSON(),
            isOwner,
            canEdit,
            effectivePermission
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Note
router.put('/notes/:id', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Resolve effective permission (handle 'inherit' from book)
        const effectivePermission = await resolveNotePermission(note);

        // Check user-specific permission override
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Permission check for editing
        let canEdit = false;
        if (isOwner) {
            canEdit = true;
        } else if (userPermOverride === 'edit') {
            canEdit = true;
        } else if (effectivePermission === 'public-edit') {
            canEdit = true;
        } else if (effectivePermission === 'auth-edit' && userId) {
            canEdit = true;
        }

        if (!canEdit) {
            return res.status(403).json({ error: 'Edit permission denied' });
        }

        // Prevent permission from being updated via this endpoint
        // Use PUT /notes/:id/permission instead
        const { permission: _, commentsDisabled: requestedCommentsDisabled, isPublic: requestedIsPublic, ...updateData } = req.body;

        // Only owner can update commentsDisabled and isPublic
        if (isOwner && requestedCommentsDisabled !== undefined) {
            updateData.commentsDisabled = requestedCommentsDisabled;
        }
        if (isOwner && requestedIsPublic !== undefined) {
            updateData.isPublic = requestedIsPublic;
        }

        // Auto-parse tags from content if content is being updated
        if (updateData.content !== undefined) {
            updateData.tags = parseTags(updateData.content);
            // Track when content was last edited
            updateData.lastEditedAt = new Date();
        }

        // Set last editor (content changes) and last updater (any changes)
        if (userId) {
            updateData.lastEditorId = userId;
            updateData.lastUpdaterId = userId;
        }

        await note.update(updateData);
        res.json({
            ...note.toJSON(),
            isOwner,
            canEdit,
            effectivePermission
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Permission constants
const VALID_PERMISSIONS = ['public-edit', 'auth-edit', 'public-view', 'auth-view', 'private'];
const VALID_NOTE_PERMISSIONS = ['public-edit', 'auth-edit', 'public-view', 'auth-view', 'private', 'inherit'];
const VALID_BOOK_PERMISSIONS = ['public-edit', 'auth-edit', 'public-view', 'auth-view', 'private'];
const VALID_USER_PERMISSIONS = ['view', 'edit'];

// Helper function to get user-specific permission override
async function getUserPermission(targetType, targetId, userId) {
    if (!userId) return null;
    const userPerm = await db.Permission.findOne({
        where: { targetType, targetId, userId }
    });
    return userPerm ? userPerm.permission : null;
}

// Helper function to resolve effective permission for a Note
// If permission is 'inherit' and note belongs to a book, use the book's permission
async function resolveNotePermission(note) {
    if (note.permission === 'inherit' && note.bookId) {
        const book = await db.Book.findByPk(note.bookId);
        return book ? (book.permission || 'private') : 'private';
    }
    return note.permission || 'private';
}

// Helper: Check if user has specific permission via user override
async function checkUserPermission(targetType, targetId, userId, requiredLevel) {
    const userPerm = await getUserPermission(targetType, targetId, userId);
    if (!userPerm) return false;
    if (requiredLevel === 'view') return userPerm === 'view' || userPerm === 'edit';
    if (requiredLevel === 'edit') return userPerm === 'edit';
    return false;
}

// Update Note Permission (owner only)
router.put('/notes/:id/permission', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const isOwner = note.ownerId && note.ownerId === userId;
        if (!isOwner) {
            return res.status(403).json({ error: 'Only owner can change permission' });
        }

        const { permission } = req.body;

        // 'inherit' is only valid for notes inside a book
        if (permission === 'inherit' && !note.bookId) {
            return res.status(400).json({ error: 'inherit permission is only valid for notes inside a book' });
        }

        if (!VALID_NOTE_PERMISSIONS.includes(permission)) {
            return res.status(400).json({ error: 'Invalid permission value' });
        }

        await note.update({ permission, lastUpdaterId: userId });
        res.json({ success: true, permission });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Note User Permissions (owner only)
router.get('/notes/:id/user-permissions', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        if (!isOwner) return res.status(403).json({ error: 'Only owner can view user permissions' });

        const permissions = await db.Permission.findAll({
            where: { targetType: 'note', targetId: note.id },
            include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'name', 'avatar'] }]
        });

        res.json(permissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add Note User Permission (owner only)
router.post('/notes/:id/user-permissions', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        if (!isOwner) return res.status(403).json({ error: 'Only owner can manage user permissions' });

        const { targetUserId, permission } = req.body;
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });
        if (!VALID_USER_PERMISSIONS.includes(permission)) {
            return res.status(400).json({ error: 'Invalid permission. Must be "view" or "edit"' });
        }

        // Cannot add permission for owner
        if (targetUserId === note.ownerId) {
            return res.status(400).json({ error: 'Cannot add permission for the owner' });
        }

        // Check if target user exists
        const targetUser = await db.User.findByPk(targetUserId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        // Upsert permission
        const [perm, created] = await db.Permission.findOrCreate({
            where: { targetType: 'note', targetId: note.id, userId: targetUserId },
            defaults: { permission }
        });

        if (!created) {
            await perm.update({ permission });
        }

        res.json({
            success: true,
            permission: perm.permission,
            user: { id: targetUser.id, username: targetUser.username, name: targetUser.name, avatar: targetUser.avatar }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Note User Permission (owner only)
router.delete('/notes/:id/user-permissions/:targetUserId', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        if (!isOwner) return res.status(403).json({ error: 'Only owner can manage user permissions' });

        const deleted = await db.Permission.destroy({
            where: {
                targetType: 'note',
                targetId: note.id,
                userId: req.params.targetUserId
            }
        });

        if (deleted === 0) return res.status(404).json({ error: 'Permission not found' });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get All Notes (Home)
// ?includeBookNotes=true to include notes inside books (for tag filtering)
router.get('/notes', async (req, res) => {
    try {
        const userId = req.session.userId || null;
        const whereClause = req.query.includeBookNotes === 'true'
            ? {} // All notes
            : { bookId: null }; // Only standalone notes

        const notes = await db.Note.findAll({
            where: whereClause,
            order: [['updatedAt', 'DESC']],
            limit: req.query.includeBookNotes === 'true' ? 100 : 20,
            include: [
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username'] }
            ]
        });

        // Add canDelete and canEdit for each note, and filter by permission
        const notesWithPermissions = await Promise.all(notes.map(async (note) => {
            const noteData = note.toJSON();
            const isOwner = noteData.ownerId && noteData.ownerId === userId;
            const effectivePermission = await resolveNotePermission(note);

            // Filter out items the user cannot access
            // Private: only owner can see
            if (effectivePermission === 'private' && !isOwner) {
                return null;
            }
            // Auth-view or auth-edit: must be logged in
            if ((effectivePermission === 'auth-view' || effectivePermission === 'auth-edit') && !userId) {
                return null;
            }

            let canEdit = false;
            let canDelete = false;
            if (isOwner) {
                canEdit = true;
                canDelete = true;
            } else if ((effectivePermission === 'public-edit' || effectivePermission === 'auth-edit') && userId) {
                canEdit = true;
                canDelete = true;
            }

            return { ...noteData, isOwner, canEdit, canDelete };
        }));

        // Filter out null entries (items user cannot access)
        res.json(notesWithPermissions.filter(n => n !== null));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Books ---

// Create Book
router.post('/books', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Login required' });
    }
    let id = generateId();
    let retry = 0;
    while (retry < 5) {
        try {
            const book = await db.Book.create({
                id: id,
                title: (req.body && req.body.title) || 'Untitled Book',
                description: (req.body && req.body.description) || '',
                ownerId: req.session.userId || null
            });
            return res.json(book);
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                id = generateId();
                retry++;
            } else {
                return res.status(500).json({ error: e.message });
            }
        }
    }
    res.status(500).json({ error: 'Failed to generate unique ID' });
});

// Get Book with Notes
router.get('/books/:id', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id, {
            include: [
                { model: db.Note, attributes: ['id', 'title', 'updatedAt', 'permission', 'order'] },
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username'] }
            ],
            order: [[db.Note, 'order', 'ASC']]
        });
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';

        // Check user-specific permission override
        const userPermOverride = await getUserPermission('book', book.id, userId);

        // Permission check
        if (permission === 'private') {
            if (!isOwner && !userPermOverride) {
                return res.status(403).json({ error: 'Access denied' });
            }
        } else if (permission === 'auth-view' || permission === 'auth-edit') {
            if (!userId) {
                return res.status(401).json({ error: 'Login required' });
            }
        }
        // public-view and public-edit allow anyone

        // Determine edit and add note capabilities
        let canEdit = false;
        let canAddNote = false;
        if (isOwner) {
            canEdit = true;
            canAddNote = true;
        } else if (userPermOverride === 'edit') {
            canEdit = true;
            canAddNote = true;
        } else if (permission === 'public-edit') {
            canEdit = true;
            canAddNote = true;
        } else if (permission === 'auth-edit' && userId) {
            canEdit = true;
            canAddNote = true;
        }

        res.json({
            ...book.toJSON(),
            isOwner,
            canEdit,
            canAddNote
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Book
router.put('/books/:id', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';

        // Permission check for editing
        let canEdit = false;
        if (isOwner) {
            canEdit = true;
        } else if (permission === 'public-edit') {
            canEdit = true;
        } else if (permission === 'auth-edit' && userId) {
            canEdit = true;
        }

        if (!canEdit) {
            return res.status(403).json({ error: 'Edit permission denied' });
        }

        // Prevent permission from being updated via this endpoint
        // Use PUT /books/:id/permission instead
        const { permission: _, isPublic: requestedIsPublic, ...updateData } = req.body;

        // Only owner can update isPublic
        if (isOwner && requestedIsPublic !== undefined) {
            updateData.isPublic = requestedIsPublic;
        }

        // Set last updater
        if (userId) {
            updateData.lastUpdaterId = userId;
        }

        await book.update(updateData);
        res.json({
            ...book.toJSON(),
            isOwner,
            canEdit
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Book Permission (owner only)
router.put('/books/:id/permission', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const isOwner = book.ownerId && book.ownerId === userId;
        if (!isOwner) {
            return res.status(403).json({ error: 'Only owner can change permission' });
        }

        const { permission } = req.body;
        if (!VALID_BOOK_PERMISSIONS.includes(permission)) {
            return res.status(400).json({ error: 'Invalid permission value' });
        }

        await book.update({ permission });
        res.json({ success: true, permission });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Book User Permissions (owner only)
router.get('/books/:id/user-permissions', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        if (!isOwner) return res.status(403).json({ error: 'Only owner can view user permissions' });

        const permissions = await db.Permission.findAll({
            where: { targetType: 'book', targetId: book.id },
            include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'name', 'avatar'] }]
        });

        res.json(permissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add Book User Permission (owner only)
router.post('/books/:id/user-permissions', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        if (!isOwner) return res.status(403).json({ error: 'Only owner can manage user permissions' });

        const { targetUserId, permission } = req.body;
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });
        if (!VALID_USER_PERMISSIONS.includes(permission)) {
            return res.status(400).json({ error: 'Invalid permission. Must be "view" or "edit"' });
        }

        // Cannot add permission for owner
        if (targetUserId === book.ownerId) {
            return res.status(400).json({ error: 'Cannot add permission for the owner' });
        }

        // Check if target user exists
        const targetUser = await db.User.findByPk(targetUserId);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        // Upsert permission
        const [perm, created] = await db.Permission.findOrCreate({
            where: { targetType: 'book', targetId: book.id, userId: targetUserId },
            defaults: { permission }
        });

        if (!created) {
            await perm.update({ permission });
        }

        res.json({
            success: true,
            permission: perm.permission,
            user: { id: targetUser.id, username: targetUser.username, name: targetUser.name, avatar: targetUser.avatar }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Book User Permission (owner only)
router.delete('/books/:id/user-permissions/:targetUserId', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        if (!isOwner) return res.status(403).json({ error: 'Only owner can manage user permissions' });

        const deleted = await db.Permission.destroy({
            where: {
                targetType: 'book',
                targetId: book.id,
                userId: req.params.targetUserId
            }
        });

        if (deleted === 0) return res.status(404).json({ error: 'Permission not found' });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create Note in Book
router.post('/books/:id/notes', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const bookPermission = book.permission || 'private';

        // Check if user can add notes
        let canAddNote = false;
        if (isOwner) {
            canAddNote = true;
        } else if (bookPermission === 'public-edit') {
            canAddNote = true;
        } else if (bookPermission === 'auth-edit' && userId) {
            canAddNote = true;
        }

        if (!canAddNote) {
            return res.status(403).json({ error: 'Cannot add notes to this book' });
        }

        // Create note with 'inherit' permission by default for notes in a book
        // Get max order for notes in this book
        const maxOrderNote = await db.Note.findOne({
            where: { bookId: book.id },
            order: [['order', 'DESC']],
            attributes: ['order']
        });
        const newOrder = (maxOrderNote?.order ?? -1) + 1;

        let id = generateId();
        let retry = 0;
        while (retry < 5) {
            try {
                const note = await db.Note.create({
                    id: id,
                    title: (req.body && req.body.title) || 'Untitled Note',
                    content: (req.body && req.body.content) || '',
                    bookId: book.id,
                    ownerId: userId,
                    permission: 'inherit', // Default to inherit from book
                    order: newOrder
                });
                return res.json(note);
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    id = generateId();
                    retry++;
                } else {
                    throw e;
                }
            }
        }
        res.status(500).json({ error: 'Failed to generate unique ID' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reorder Notes in Book
router.put('/books/:id/notes/reorder', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const bookPermission = book.permission || 'private';

        // Check if user can edit (reorder)
        let canEdit = false;
        if (isOwner) {
            canEdit = true;
        } else if (bookPermission === 'public-edit') {
            canEdit = true;
        } else if (bookPermission === 'auth-edit' && userId) {
            canEdit = true;
        }

        if (!canEdit) {
            return res.status(403).json({ error: 'No permission to reorder notes' });
        }

        const { noteIds } = req.body;
        if (!Array.isArray(noteIds)) {
            return res.status(400).json({ error: 'noteIds must be an array' });
        }

        // Update order for each note
        const updates = noteIds.map((noteId, index) =>
            db.Note.update({ order: index }, { where: { id: noteId, bookId: book.id } })
        );
        await Promise.all(updates);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get All Books (Home)
router.get('/books', async (req, res) => {
    try {
        const userId = req.session.userId || null;
        const books = await db.Book.findAll({
            order: [['updatedAt', 'DESC']],
            limit: 20,
            include: [
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username'] }
            ]
        });

        // Add canDelete and canEdit for each book, and filter by permission
        const booksWithPermissions = books.map(book => {
            const bookData = book.toJSON();
            const isOwner = bookData.ownerId && bookData.ownerId === userId;
            const permission = bookData.permission || 'private';

            // Filter out items the user cannot access
            // Private: only owner can see
            if (permission === 'private' && !isOwner) {
                return null;
            }
            // Auth-view or auth-edit: must be logged in
            if ((permission === 'auth-view' || permission === 'auth-edit') && !userId) {
                return null;
            }

            let canEdit = false;
            let canDelete = false;
            if (isOwner) {
                canEdit = true;
                canDelete = true;
            } else if ((permission === 'public-edit' || permission === 'auth-edit') && userId) {
                canEdit = true;
                canDelete = true;
            }

            return { ...bookData, isOwner, canEdit, canDelete };
        });

        // Filter out null entries (items user cannot access)
        res.json(booksWithPermissions.filter(b => b !== null));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Book (Soft)
router.delete('/books/:id', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';

        // Permission check: only owner or users with edit permission can delete
        let canDelete = false;
        if (isOwner) {
            canDelete = true;
        } else if (permission === 'public-edit' && userId) {
            canDelete = true;
        } else if (permission === 'auth-edit' && userId) {
            canDelete = true;
        }

        if (!canDelete) {
            return res.status(403).json({ error: '沒有刪除權限' });
        }

        // Record who deleted this book
        if (userId) {
            await book.update({ deletedById: userId });
        }

        await book.destroy();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Restore Book
router.post('/books/:id/restore', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }
        const book = await db.Book.findByPk(req.params.id, { paranoid: false });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.ownerId !== req.session.userId) {
            return res.status(403).json({ error: 'Only owner can restore' });
        }
        await book.restore();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Force Delete Book
router.delete('/books/:id/force', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }
        const book = await db.Book.findByPk(req.params.id, { paranoid: false });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.ownerId !== req.session.userId) {
            return res.status(403).json({ error: 'Only owner can force delete' });
        }
        await book.destroy({ force: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Trash ---

// Delete Note (Soft)
router.delete('/notes/:id', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Resolve effective permission (handle 'inherit' case)
        const effectivePermission = await resolveNotePermission(note);

        // Permission check: only owner or users with edit permission can delete
        let canDelete = false;
        if (isOwner) {
            canDelete = true;
        } else if (effectivePermission === 'public-edit' && userId) {
            canDelete = true;
        } else if (effectivePermission === 'auth-edit' && userId) {
            canDelete = true;
        }

        if (!canDelete) {
            return res.status(403).json({ error: '沒有刪除權限' });
        }

        // Record who deleted this note
        if (userId) {
            await note.update({ deletedById: userId });
        }

        await note.destroy();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Restore Note
router.post('/notes/:id/restore', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }
        const note = await db.Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        if (note.ownerId !== req.session.userId) {
            return res.status(403).json({ error: 'Only owner can restore' });
        }
        await note.restore();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Force Delete Note
router.delete('/notes/:id/force', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }
        const note = await db.Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        if (note.ownerId !== req.session.userId) {
            return res.status(403).json({ error: 'Only owner can force delete' });
        }
        await note.destroy({ force: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Trash
router.get('/trash', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }
        const notes = await db.Note.findAll({
            where: { deletedAt: { [db.Sequelize.Op.ne]: null } },
            paranoid: false,
            include: [
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'deletedBy', attributes: ['id', 'username'] }
            ]
        });
        const books = await db.Book.findAll({
            where: { deletedAt: { [db.Sequelize.Op.ne]: null } },
            paranoid: false,
            include: [
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'deletedBy', attributes: ['id', 'username'] }
            ]
        });
        res.json({ notes, books });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Comments ---

// Get feature config (public)
router.get('/config/features', (req, res) => {
    res.json({
        comments: config.features?.comments !== false
    });
});

// Get comments for a note
router.get('/notes/:id/comments', async (req, res) => {
    try {
        const comments = await db.Comment.findAll({
            where: { noteId: req.params.id },
            include: [
                { model: db.User, as: 'user', attributes: ['id', 'username', 'name', 'avatar', 'role'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        res.json(comments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add a comment (requires login + feature enabled)
router.post('/notes/:id/comments', async (req, res) => {
    try {
        // Check login
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        // Check if comments feature is enabled
        if (config.features?.comments === false) {
            return res.status(403).json({ error: 'Comments feature is disabled' });
        }

        const { content, parentId } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content is required' });
        }

        // Check if note exists
        const note = await db.Note.findByPk(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Check if comments are disabled for this note
        if (note.commentsDisabled) {
            return res.status(403).json({ error: 'Comments are disabled for this note' });
        }

        // If replying, check parent comment exists
        if (parentId) {
            const parentComment = await db.Comment.findByPk(parentId);
            if (!parentComment || parentComment.noteId !== req.params.id) {
                return res.status(400).json({ error: 'Invalid parent comment' });
            }
        }

        const comment = await db.Comment.create({
            noteId: req.params.id,
            userId: req.session.userId,
            content: content.trim(),
            parentId: parentId || null
        });

        // Fetch with user info
        const commentWithUser = await db.Comment.findByPk(comment.id, {
            include: [
                { model: db.User, as: 'user', attributes: ['id', 'username', 'name', 'avatar', 'role'] }
            ]
        });

        res.json(commentWithUser);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Edit a comment (author only)
router.put('/comments/:id', async (req, res) => {
    try {
        // Check login
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const comment = await db.Comment.findByPk(req.params.id);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Only author can edit
        if (comment.userId !== req.session.userId) {
            return res.status(403).json({ error: 'Only the author can edit this comment' });
        }

        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content is required' });
        }

        await comment.update({ content: content.trim() });

        // Fetch with user info
        const commentWithUser = await db.Comment.findByPk(comment.id, {
            include: [
                { model: db.User, as: 'user', attributes: ['id', 'username', 'name', 'avatar', 'role'] }
            ]
        });

        res.json(commentWithUser);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a comment (author, super-admin, or admin)
router.delete('/comments/:id', async (req, res) => {
    try {
        // Check login
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const comment = await db.Comment.findByPk(req.params.id);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Check permission: author, super-admin, admin, or note owner
        const currentUser = await db.User.findByPk(req.session.userId);
        if (!currentUser) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Check if current user is the note owner
        const note = await db.Note.findByPk(comment.noteId);
        const isNoteOwner = note && note.ownerId && note.ownerId === currentUser.id;

        const isAuthor = comment.userId === currentUser.id;
        const isAdmin = currentUser.role === 'super-admin' || currentUser.role === 'admin';

        if (!isAuthor && !isAdmin && !isNoteOwner) {
            return res.status(403).json({ error: 'Permission denied' });
        }

        await comment.destroy();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
