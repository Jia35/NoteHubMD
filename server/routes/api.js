const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../models');
const { generateId } = require('../utils/idGenerator');

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
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `/_uploads/${req.file.filename}`;
    res.json({ url: imageUrl, filename: req.file.filename });
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

// --- Notes ---

// Create Note
router.post('/notes', async (req, res) => {
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
                { model: db.Book, attributes: ['id', 'title'] }
            ]
        });
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Resolve effective permission (handle 'inherit' from book)
        const effectivePermission = await resolveNotePermission(note);

        // Permission check
        if (effectivePermission === 'private') {
            if (!isOwner) {
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

        // Permission check for editing
        let canEdit = false;
        if (isOwner) {
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
        const { permission: _, ...updateData } = req.body;

        // Auto-parse tags from content if content is being updated
        if (updateData.content !== undefined) {
            updateData.tags = parseTags(updateData.content);
        }

        // Set last editor
        if (userId) {
            updateData.lastEditorId = userId;
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

// Helper function to resolve effective permission for a Note
// If permission is 'inherit' and note belongs to a book, use the book's permission
async function resolveNotePermission(note) {
    if (note.permission === 'inherit' && note.bookId) {
        const book = await db.Book.findByPk(note.bookId);
        return book ? (book.permission || 'private') : 'private';
    }
    return note.permission || 'private';
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

        await note.update({ permission });
        res.json({ success: true, permission });
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
                { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] }
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
                { model: db.Note, attributes: ['id', 'title', 'updatedAt', 'permission'] },
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] }
            ]
        });
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';

        // Permission check
        if (permission === 'private') {
            if (!isOwner) {
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
        const { permission: _, ...updateData } = req.body;

        // Set last editor
        if (userId) {
            updateData.lastEditorId = userId;
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
                    permission: 'inherit' // Default to inherit from book
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

// Get All Books (Home)
router.get('/books', async (req, res) => {
    try {
        const userId = req.session.userId || null;
        const books = await db.Book.findAll({
            order: [['updatedAt', 'DESC']],
            limit: 20,
            include: [
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] }
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
        const book = await db.Book.findByPk(req.params.id, { paranoid: false });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        await book.restore();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Force Delete Book
router.delete('/books/:id/force', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id, { paranoid: false });
        if (!book) return res.status(404).json({ error: 'Book not found' });
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
        const note = await db.Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        await note.restore();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Force Delete Note
router.delete('/notes/:id/force', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        await note.destroy({ force: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Trash
router.get('/trash', async (req, res) => {
    try {
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

module.exports = router;
