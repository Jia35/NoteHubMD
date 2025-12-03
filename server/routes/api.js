const express = require('express');
const router = express.Router();
const db = require('../models');
const { generateId } = require('../utils/idGenerator');

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
        res.json(note);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Note
router.put('/notes/:id', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        await note.update(req.body);
        res.json(note);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get All Notes (Home)
router.get('/notes', async (req, res) => {
    try {
        const notes = await db.Note.findAll({
            where: { bookId: null }, // Only standalone notes
            order: [['updatedAt', 'DESC']],
            limit: 20
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
