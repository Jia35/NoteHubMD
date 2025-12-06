const express = require('express');
const router = express.Router();
const db = require('../models');
const { generateId } = require('../utils/idGenerator');

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
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;
        const permission = note.permission || 'private';

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

        // Determine if user can edit
        let canEdit = false;
        if (isOwner) {
            canEdit = true;
        } else if (permission === 'public-edit') {
            canEdit = true;
        } else if (permission === 'auth-edit' && userId) {
            canEdit = true;
        }

        res.json({
            ...note.toJSON(),
            isOwner,
            canEdit
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
        const permission = note.permission || 'private';

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
        // Use PUT /notes/:id/permission instead
        const { permission: _, ...updateData } = req.body;

        // Auto-parse tags from content if content is being updated
        if (updateData.content !== undefined) {
            updateData.tags = parseTags(updateData.content);
        }

        await note.update(updateData);
        res.json({
            ...note.toJSON(),
            isOwner,
            canEdit
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Note Permission (owner only)
const VALID_PERMISSIONS = ['public-edit', 'auth-edit', 'public-view', 'auth-view', 'private'];
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
        if (!VALID_PERMISSIONS.includes(permission)) {
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
        const whereClause = req.query.includeBookNotes === 'true'
            ? {} // All notes
            : { bookId: null }; // Only standalone notes

        const notes = await db.Note.findAll({
            where: whereClause,
            order: [['updatedAt', 'DESC']],
            limit: req.query.includeBookNotes === 'true' ? 100 : 20
        });
        res.json(notes);
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
            include: [{ model: db.Note, attributes: ['id', 'title', 'updatedAt'] }]
        });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        res.json(book);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Book
router.put('/books/:id', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const updateData = { ...req.body };

        // Auto-parse tags from description if description is being updated
        if (updateData.description !== undefined) {
            updateData.tags = parseTags(updateData.description);
        }

        await book.update(updateData);
        res.json(book);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create Note in Book
router.post('/books/:id/notes', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        let id = generateId();
        let retry = 0;
        while (retry < 5) {
            try {
                const note = await db.Note.create({
                    id: id,
                    title: (req.body && req.body.title) || 'Untitled Note',
                    content: (req.body && req.body.content) || '',
                    bookId: book.id,
                    ownerId: req.session.userId || null
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
        const books = await db.Book.findAll({
            order: [['updatedAt', 'DESC']],
            limit: 20
        });
        res.json(books);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete Book (Soft)
router.delete('/books/:id', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });
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
            paranoid: false
        });
        const books = await db.Book.findAll({
            where: { deletedAt: { [db.Sequelize.Op.ne]: null } },
            paranoid: false
        });
        res.json({ notes, books });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
