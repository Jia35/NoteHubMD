const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../models');
const config = require('../config');
const { generateId, generateShareId, generateImageId } = require('../utils/idGenerator');
const { sendCommentWebhook } = require('../utils/webhook');
const DiffMatchPatch = require('diff-match-patch');

// Get io from index.js for broadcasting events
const getIo = () => require('../index').io;

// Revision settings
const REVISION_MAX_COUNT = 50;
const REVISION_IDLE_MINUTES = 5;
const REVISION_FORCE_MINUTES = 15;

// --- App Info ---
router.get('/version', (req, res) => {
    res.json({ version: config.app.version });
});

// --- Image Upload ---

// Configure multer storage
const uploadDir = path.join(__dirname, '../../../_uploads');
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
        const imageId = generateImageId(); // 8-character Base62 string
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `${yyyyMM}_${imageId}${ext}`;
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

/**
 * @swagger
 * /api/upload/image:
 *   post:
 *     summary: 上傳圖片
 *     description: 上傳圖片檔案 (JPEG, PNG, GIF, WebP)，最大 5MB
 *     tags: [Upload]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: 上傳成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: 圖片網址
 *                 filename:
 *                   type: string
 *       400:
 *         description: 未上傳檔案或格式錯誤
 *       401:
 *         description: 未認證
 */
// Image upload endpoint
router.post('/upload/image', upload.single('image'), (req, res) => {
    if (!req.session.userId && !req.isMasterApiKey) {
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
const avatarUploadDir = path.join(__dirname, '../../../_uploads/avatars');
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

// --- System Articles ---

// Get System Articles (the system book with its notes)
router.get('/system/articles', async (req, res) => {
    try {
        const systemBook = await db.Book.findOne({
            where: { isSystem: true },
            include: [
                {
                    model: db.Note,
                    attributes: ['id', 'title', 'order', 'shareId'],
                    where: { isSystem: true },
                    required: false,
                    order: [['order', 'ASC']]
                }
            ]
        });

        if (!systemBook) {
            return res.json({ book: null, notes: [] });
        }

        res.json({
            book: {
                id: systemBook.id,
                title: systemBook.title,
                description: systemBook.description
            },
            notes: systemBook.Notes || []
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Specific System Article
router.get('/system/articles/:id', async (req, res) => {
    try {
        const note = await db.Note.findOne({
            where: { id: req.params.id, isSystem: true }
        });

        if (!note) {
            return res.status(404).json({ error: 'System article not found' });
        }

        res.json({
            id: note.id,
            title: note.title,
            content: note.content,
            shareId: note.shareId
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    if (!req.session.userId && !req.isMasterApiKey) {
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

/**
 * @swagger
 * /api/notes:
 *   post:
 *     summary: 建立新筆記
 *     description: 建立新的筆記，可以是 Markdown、白板 (Excalidraw) 或流程圖 (Draw.io)
 *     tags: [Notes]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: 筆記標題
 *               content:
 *                 type: string
 *                 description: 筆記內容
 *               noteType:
 *                 type: string
 *                 enum: [markdown, excalidraw, drawio]
 *                 default: markdown
 *               permission:
 *                 type: string
 *                 enum: [private, public-view, public-edit, auth-view, auth-edit]
 *     responses:
 *       200:
 *         description: 成功建立筆記
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 shareId:
 *                   type: string
 *       401:
 *         description: 未認證
 */
// Create Note
router.post('/notes', async (req, res) => {
    if (!req.session.userId && !req.isMasterApiKey) {
        return res.status(401).json({ error: 'Login required' });
    }

    // Validate permission if provided (standalone note cannot use 'inherit')
    const { permission, isPublic, noteType } = req.body || {};

    // Validate noteType
    if (noteType && !['markdown', 'excalidraw', 'drawio'].includes(noteType)) {
        return res.status(400).json({ error: 'Invalid noteType. Must be markdown, excalidraw or drawio' });
    }

    if (permission !== undefined) {
        // Standalone notes cannot use 'inherit' - that's only for notes in books
        if (!VALID_PERMISSIONS.includes(permission)) {
            return res.status(400).json({
                error: `Invalid permission. Must be one of: ${VALID_PERMISSIONS.join(', ')}`
            });
        }
    }
    if (isPublic !== undefined && typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: 'isPublic must be a boolean' });
    }

    let id = generateId();
    let shareId = generateId(7);
    let retry = 0;
    while (retry < 5) {
        try {
            // Determine default title based on note type
            let defaultTitle = 'Untitled Note';
            if (noteType === 'excalidraw') defaultTitle = 'Untitled Whiteboard';
            if (noteType === 'drawio') defaultTitle = 'Untitled Drawio';

            // Initialize content for diagram types (stored as JSON string)
            let contentValue = (req.body && req.body.content) || '';
            if (noteType === 'excalidraw' && !contentValue) {
                contentValue = JSON.stringify({ elements: [], appState: {}, files: {} });
            } else if (noteType === 'drawio' && !contentValue) {
                contentValue = JSON.stringify({ xml: null });
            }

            const now = new Date();
            const noteData = {
                id: id,
                title: (req.body && req.body.title) || defaultTitle,
                content: contentValue,
                noteType: noteType || 'markdown',
                ownerId: req.session.userId || null,
                shareId: shareId,  // Auto-generated share link
                lastEditedAt: now,
                lastEditorId: req.session.userId || null,
                lastUpdaterId: req.session.userId || null,
                updatedAt: now
            };
            // Add optional fields if provided
            if (permission !== undefined) noteData.permission = permission;
            if (isPublic !== undefined) noteData.isPublic = isPublic;

            const note = await db.Note.create(noteData);
            // Update user's lastActiveAt
            if (req.session.userId) {
                db.User.update({ lastActiveAt: new Date() }, { where: { id: req.session.userId } }).catch(() => { });
            }
            return res.json(note);
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                id = generateId();
                shareId = generateId(7);
                retry++;
            } else {
                return res.status(500).json({ error: e.message });
            }
        }
    }
    res.status(500).json({ error: 'Failed to generate unique ID' });
});

/**
 * @swagger
 * /api/notes/{id}:
 *   get:
 *     summary: 取得特定筆記
 *     description: 取得筆記內容、權限資訊與相關元資料
 *     tags: [Notes]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 筆記 ID
 *     responses:
 *       200:
 *         description: 筆記詳情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 content:
 *                   type: string
 *                 noteType:
 *                   type: string
 *                   enum: [markdown, excalidraw, drawio]
 *                 isOwner:
 *                   type: boolean
 *                 canEdit:
 *                   type: boolean
 *                 effectivePermission:
 *                   type: string
 *       401:
 *         description: 需要登入
 *       403:
 *         description: 沒有存取權限
 *       404:
 *         description: 筆記不存在
 */
// Get Note
router.get('/notes/:id', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id, {
            include: [
                {
                    model: db.Book,
                    attributes: ['id', 'title'],
                    include: [
                        { model: db.Note, attributes: ['id', 'title', 'order', 'noteType'], order: [['order', 'ASC']] }
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

        // Build response, parsing content to diagramData for excalidraw/drawio
        const responseData = note.toJSON();
        if (note.noteType === 'excalidraw' || note.noteType === 'drawio') {
            try {
                responseData.diagramData = JSON.parse(note.content || '{}');
            } catch (e) {
                responseData.diagramData = note.noteType === 'excalidraw'
                    ? { elements: [], appState: {}, files: {} }
                    : { xml: null };
            }
        }

        res.json({
            ...responseData,
            isOwner,
            canEdit,
            effectivePermission
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/notes/{id}:
 *   put:
 *     summary: 更新筆記
 *     description: 更新筆記內容、標題、權限或設定
 *     tags: [Notes]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 筆記 ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               permission:
 *                 type: string
 *                 enum: [private, public-view, public-edit, auth-view, auth-edit, inherit]
 *               isPublic:
 *                 type: boolean
 *               commentsEnabled:
 *                 type: boolean
 *               bookId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *       403:
 *         description: 沒有編輯權限
 *       404:
 *         description: 筆記不存在
 */
// Update Note
router.put('/notes/:id', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Master API Key bypasses all permission checks
        let canEdit = req.isMasterApiKey === true;
        let effectivePermission = null;

        if (!canEdit) {
            // Resolve effective permission (handle 'inherit' from book)
            effectivePermission = await resolveNotePermission(note);

            // Check user-specific permission override
            const userPermOverride = await getUserPermission('note', note.id, userId);

            // Permission check for editing
            if (isOwner) {
                canEdit = true;
            } else if (userPermOverride === 'edit') {
                canEdit = true;
            } else if (effectivePermission === 'public-edit') {
                canEdit = true;
            } else if (effectivePermission === 'auth-edit' && userId) {
                canEdit = true;
            }
        } else {
            // If canEdit is already true (Master API Key), still get effectivePermission for response
            effectivePermission = await resolveNotePermission(note);
        }

        if (!canEdit) {
            return res.status(403).json({ error: 'Edit permission denied' });
        }

        // Prepare update data
        const { permission: requestedPermission, commentsEnabled: requestedCommentsEnabled, isPublic: requestedIsPublic, ...updateData } = req.body;

        // Track if permission is being changed (for WebSocket broadcast later)
        let permissionChanged = false;
        let newPermission = null;

        // Master API Key or owner can update permission, commentsEnabled and isPublic
        if (req.isMasterApiKey || isOwner) {
            if (requestedPermission !== undefined) {
                // Validate 'inherit' permission - only valid for notes inside a book
                if (requestedPermission === 'inherit' && !note.bookId) {
                    return res.status(400).json({ error: 'inherit permission is only valid for notes inside a book' });
                }
                // Validate permission value
                if (!['public-edit', 'auth-edit', 'public-view', 'auth-view', 'private', 'inherit'].includes(requestedPermission)) {
                    return res.status(400).json({ error: 'Invalid permission value' });
                }
                // Check if permission actually changed
                if (note.permission !== requestedPermission) {
                    permissionChanged = true;
                    newPermission = requestedPermission;
                }
                updateData.permission = requestedPermission;
            }
            if (requestedCommentsEnabled !== undefined) {
                updateData.commentsEnabled = requestedCommentsEnabled;
            }
            if (requestedIsPublic !== undefined) {
                updateData.isPublic = requestedIsPublic;
            }
        }

        // Auto-parse tags from content if content is being updated (markdown notes only)
        if (updateData.content !== undefined && note.noteType !== 'excalidraw') {
            updateData.tags = parseTags(updateData.content);
            // Track when content was last edited
            updateData.lastEditedAt = new Date();

            // --- Auto-save revision logic ---
            const now = new Date();
            const lastEditedAt = note.lastEditedAt ? new Date(note.lastEditedAt) : null;
            const savedAt = note.savedAt ? new Date(note.savedAt) : null;

            // Check if revision should be saved:
            // 1. First edit ever (no savedAt)
            // 2. 10 minutes idle rule: no edits for 10 minutes
            // 3. 20 minutes force rule: 20 minutes since last save
            let shouldSaveRevision = false;

            if (!savedAt) {
                // First revision for this note
                shouldSaveRevision = true;
            } else if (lastEditedAt && (now - lastEditedAt) > REVISION_IDLE_MINUTES * 60 * 1000) {
                // 10 minutes since last edit
                shouldSaveRevision = true;
            } else if ((now - savedAt) > REVISION_FORCE_MINUTES * 60 * 1000) {
                // 20 minutes since last save
                shouldSaveRevision = true;
            }

            if (shouldSaveRevision && userId) {
                try {
                    const dmp = new DiffMatchPatch();
                    const oldContent = note.content || '';
                    const newContent = updateData.content;

                    // Get existing revisions
                    const revisions = await db.NoteRevision.findAll({
                        where: { noteId: note.id },
                        order: [['createdAt', 'DESC']]
                    });

                    if (revisions.length === 0) {
                        // First revision: store the new content (not empty old content)
                        await db.NoteRevision.create({
                            noteId: note.id,
                            content: newContent,
                            length: newContent.length,
                            editorId: userId
                        });
                    } else {
                        // Calculate diff from old content to new content
                        const diffs = dmp.diff_main(oldContent, newContent);
                        dmp.diff_cleanupEfficiency(diffs);
                        const patches = dmp.patch_make(oldContent, diffs);
                        const patchText = dmp.patch_toText(patches);

                        if (patchText) {
                            // Clear content from previous latest revision
                            const latestRevision = revisions[0];
                            if (latestRevision && latestRevision.content !== null) {
                                await latestRevision.update({ content: null });
                            }

                            // Create new revision with patch and full content
                            await db.NoteRevision.create({
                                noteId: note.id,
                                patch: patchText,
                                content: newContent,
                                length: newContent.length,
                                editorId: userId
                            });

                            // Cleanup old revisions (keep only REVISION_MAX_COUNT)
                            const allRevisions = await db.NoteRevision.findAll({
                                where: { noteId: note.id },
                                order: [['createdAt', 'DESC']]
                            });
                            if (allRevisions.length > REVISION_MAX_COUNT) {
                                const toDelete = allRevisions.slice(REVISION_MAX_COUNT);
                                await db.NoteRevision.destroy({
                                    where: { id: toDelete.map(r => r.id) }
                                });
                            }
                        }
                    }

                    updateData.savedAt = now;
                } catch (revError) {
                    console.error('Revision save error:', revError);
                    // Continue with note update even if revision fails
                }
            }
        }

        // Handle diagramData update for excalidraw and drawio notes (convert to content)
        if (updateData.diagramData !== undefined && (note.noteType === 'excalidraw' || note.noteType === 'drawio')) {
            updateData.content = JSON.stringify(updateData.diagramData);
            delete updateData.diagramData;
            updateData.lastEditedAt = new Date();
        }

        // Set last editor (content changes) and last updater (any changes)
        if (userId) {
            updateData.lastEditorId = userId;
            updateData.lastUpdaterId = userId;
            // Update user's lastActiveAt (low-impact: only on actual save)
            db.User.update({ lastActiveAt: new Date() }, { where: { id: userId } }).catch(() => { });
        }

        // Handle bookId change: assign order at the end
        if (updateData.bookId !== undefined && updateData.bookId !== note.bookId) {
            if (updateData.bookId) {
                const maxOrderNote = await db.Note.findOne({
                    where: { bookId: updateData.bookId },
                    order: [['order', 'DESC']]
                });

                const currentMax = maxOrderNote ? Number(maxOrderNote.order) : -1;
                updateData.order = isNaN(currentMax) ? 0 : (currentMax + 1);
            } else {
                updateData.order = 0;
            }
        }

        await note.update(updateData);

        // Broadcast permission change to all clients in the note room (if permission changed)
        if (permissionChanged && newPermission !== null) {
            const io = getIo();
            if (io) {
                io.to(note.id).emit('permission-changed', {
                    noteId: note.id,
                    permission: newPermission
                });
            }
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

// --- Note Revisions (Activity Log) ---

// Get Note Revisions List
router.get('/notes/:id/revisions', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Check view permission
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        if (effectivePermission === 'private' && !isOwner && !userPermOverride) {
            if (!userId) return res.status(401).json({ error: 'Login required' });
            return res.status(403).json({ error: 'Access denied' });
        }
        if ((effectivePermission === 'auth-view' || effectivePermission === 'auth-edit') && !userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const revisions = await db.NoteRevision.findAll({
            where: { noteId: note.id },
            order: [['createdAt', 'DESC']],
            include: [{ model: db.User, as: 'editor', attributes: ['id', 'username', 'name', 'avatar'] }],
            attributes: ['id', 'length', 'createdAt', 'editorId']
        });

        res.json(revisions.map(r => ({
            id: r.id,
            length: r.length,
            createdAt: r.createdAt,
            editor: r.editor
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Manually Save Current Version as Revision
router.post('/notes/:id/revisions', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Check edit permission
        let canEdit = false;
        if (isOwner) canEdit = true;
        else if (userPermOverride === 'edit') canEdit = true;
        else if (effectivePermission === 'public-edit') canEdit = true;
        else if (effectivePermission === 'auth-edit' && userId) canEdit = true;

        if (!canEdit) {
            return res.status(403).json({ error: 'Edit permission denied' });
        }

        const dmp = new DiffMatchPatch();
        const currentContent = note.content || '';

        // Get existing revisions
        const revisions = await db.NoteRevision.findAll({
            where: { noteId: note.id },
            order: [['createdAt', 'DESC']]
        });

        if (revisions.length === 0) {
            // First revision: store full content
            await db.NoteRevision.create({
                noteId: note.id,
                content: currentContent,
                length: currentContent.length,
                editorId: userId
            });
        } else {
            const latestRevision = revisions[0];

            // Get the content of the latest revision for diff calculation
            let lastContent = latestRevision.content;
            if (lastContent === null) {
                // Need to reconstruct from previous version with content
                for (let i = 0; i < revisions.length; i++) {
                    if (revisions[i].content !== null) {
                        lastContent = revisions[i].content;
                        break;
                    }
                }
            }

            // Calculate diff
            const diffs = dmp.diff_main(lastContent || '', currentContent);
            dmp.diff_cleanupEfficiency(diffs);
            const patches = dmp.patch_make(lastContent || '', diffs);
            const patchText = dmp.patch_toText(patches);

            if (patchText) {
                // Clear content from previous latest revision
                if (latestRevision.content !== null) {
                    await latestRevision.update({ content: null });
                }

                // Create new revision with patch and full content
                await db.NoteRevision.create({
                    noteId: note.id,
                    patch: patchText,
                    content: currentContent,
                    length: currentContent.length,
                    editorId: userId
                });

                // Cleanup old revisions (keep only REVISION_MAX_COUNT)
                const allRevisions = await db.NoteRevision.findAll({
                    where: { noteId: note.id },
                    order: [['createdAt', 'DESC']]
                });
                if (allRevisions.length > REVISION_MAX_COUNT) {
                    const toDelete = allRevisions.slice(REVISION_MAX_COUNT);
                    await db.NoteRevision.destroy({
                        where: { id: toDelete.map(r => r.id) }
                    });
                }
            }
        }

        // Update savedAt timestamp
        await note.update({ savedAt: new Date() });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Specific Revision Content (reconstructed via patches)
router.get('/notes/:id/revisions/:revisionId', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Check view permission
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        if (effectivePermission === 'private' && !isOwner && !userPermOverride) {
            if (!userId) return res.status(401).json({ error: 'Login required' });
            return res.status(403).json({ error: 'Access denied' });
        }
        if ((effectivePermission === 'auth-view' || effectivePermission === 'auth-edit') && !userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const targetRevision = await db.NoteRevision.findOne({
            where: { id: req.params.revisionId, noteId: note.id },
            include: [{ model: db.User, as: 'editor', attributes: ['id', 'username', 'name', 'avatar'] }]
        });
        if (!targetRevision) return res.status(404).json({ error: 'Revision not found' });

        // Get all revisions from newest to this one to reconstruct content
        const revisions = await db.NoteRevision.findAll({
            where: { noteId: note.id },
            order: [['createdAt', 'DESC']]
        });

        // Find the latest revision with full content
        let content = null;
        let startIndex = 0;
        for (let i = 0; i < revisions.length; i++) {
            if (revisions[i].content !== null) {
                content = revisions[i].content;
                startIndex = i;
                break;
            }
        }

        if (content === null) {
            return res.status(500).json({ error: 'Cannot reconstruct revision content' });
        }

        // Find target revision index
        const targetIndex = revisions.findIndex(r => r.id === targetRevision.id);
        if (targetIndex === -1) {
            return res.status(404).json({ error: 'Revision not found' });
        }

        // Apply patches backwards from startIndex to targetIndex
        if (targetIndex > startIndex) {
            const dmp = new DiffMatchPatch();
            for (let i = startIndex; i < targetIndex; i++) {
                const revision = revisions[i];
                if (revision.patch) {
                    try {
                        const patches = dmp.patch_fromText(revision.patch);
                        // Reverse patch: swap text1 and text2 in each diff
                        const reversedPatches = patches.map(p => {
                            const reversed = Object.assign({}, p);
                            reversed.diffs = p.diffs.map(d => {
                                if (d[0] === 1) return [-1, d[1]];  // INSERT -> DELETE
                                if (d[0] === -1) return [1, d[1]];  // DELETE -> INSERT
                                return d;
                            });
                            return reversed;
                        });
                        const [newContent, results] = dmp.patch_apply(reversedPatches, content);
                        content = newContent;
                    } catch (e) {
                        console.error('Patch apply error:', e);
                    }
                }
            }
        }

        res.json({
            id: targetRevision.id,
            content: content,
            length: targetRevision.length,
            createdAt: targetRevision.createdAt,
            editor: targetRevision.editor
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Restore to a Specific Revision
router.post('/notes/:id/revisions/:revisionId/restore', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Check edit permission
        let canEdit = false;
        if (isOwner) canEdit = true;
        else if (userPermOverride === 'edit') canEdit = true;
        else if (effectivePermission === 'public-edit') canEdit = true;
        else if (effectivePermission === 'auth-edit' && userId) canEdit = true;

        if (!canEdit) {
            return res.status(403).json({ error: 'Edit permission denied' });
        }

        // Get target revision content via the same reconstruction logic
        const targetRevision = await db.NoteRevision.findOne({
            where: { id: req.params.revisionId, noteId: note.id }
        });
        if (!targetRevision) return res.status(404).json({ error: 'Revision not found' });

        // Get all revisions to reconstruct content
        const revisions = await db.NoteRevision.findAll({
            where: { noteId: note.id },
            order: [['createdAt', 'DESC']]
        });

        let content = null;
        let startIndex = 0;
        for (let i = 0; i < revisions.length; i++) {
            if (revisions[i].content !== null) {
                content = revisions[i].content;
                startIndex = i;
                break;
            }
        }

        if (content === null) {
            return res.status(500).json({ error: 'Cannot reconstruct revision content' });
        }

        const targetIndex = revisions.findIndex(r => r.id === targetRevision.id);
        if (targetIndex > startIndex) {
            const dmp = new DiffMatchPatch();
            for (let i = startIndex; i < targetIndex; i++) {
                const revision = revisions[i];
                if (revision.patch) {
                    try {
                        const patches = dmp.patch_fromText(revision.patch);
                        const reversedPatches = patches.map(p => {
                            const reversed = Object.assign({}, p);
                            reversed.diffs = p.diffs.map(d => {
                                if (d[0] === 1) return [-1, d[1]];
                                if (d[0] === -1) return [1, d[1]];
                                return d;
                            });
                            return reversed;
                        });
                        const [newContent] = dmp.patch_apply(reversedPatches, content);
                        content = newContent;
                    } catch (e) {
                        console.error('Patch apply error:', e);
                    }
                }
            }
        }

        // Create a new revision for the restore action
        const dmp = new DiffMatchPatch();
        const currentContent = note.content || '';
        const diffs = dmp.diff_main(currentContent, content);
        dmp.diff_cleanupEfficiency(diffs);
        const patches = dmp.patch_make(currentContent, diffs);
        const patchText = dmp.patch_toText(patches);

        // Only create revision if there's a change
        if (patchText) {
            // Clear content from previous latest revision
            const latestRevision = revisions[0];
            if (latestRevision) {
                await latestRevision.update({ content: null });
            }

            // Create new revision
            await db.NoteRevision.create({
                noteId: note.id,
                patch: patchText,
                content: content,
                length: content.length,
                editorId: userId
            });

            // Cleanup old revisions (keep only REVISION_MAX_COUNT)
            const allRevisions = await db.NoteRevision.findAll({
                where: { noteId: note.id },
                order: [['createdAt', 'DESC']]
            });
            if (allRevisions.length > REVISION_MAX_COUNT) {
                const toDelete = allRevisions.slice(REVISION_MAX_COUNT);
                await db.NoteRevision.destroy({
                    where: { id: toDelete.map(r => r.id) }
                });
            }
        }

        // Update note content
        await note.update({
            content: content,
            lastEditedAt: new Date(),
            lastEditorId: userId,
            lastUpdaterId: userId,
            savedAt: new Date()
        });

        res.json({ success: true, content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get All Notes (Home)
// ?includeBookNotes=true to include notes inside books (for tag filtering)
// ?limit=1000 to fetch more items (for uncategorized view)
router.get('/notes', async (req, res) => {
    try {
        const userId = req.session.userId || null;
        const includeBookNotes = req.query.includeBookNotes === 'true';
        const limit = parseInt(req.query.limit) || (includeBookNotes ? 100 : 20);

        const whereClause = includeBookNotes
            ? { isSystem: false } // All notes except system
            : { bookId: null, isSystem: false }; // Only standalone notes, no system

        // Build include array with eager loading for permissions
        const include = [
            { model: db.User, as: 'owner', attributes: ['id', 'username'] },
            { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] },
            { model: db.User, as: 'lastUpdater', attributes: ['id', 'username'] }
        ];

        // Eager load permissions for the current user if logged in
        if (userId) {
            include.push({
                model: db.Permission,
                as: 'permissions',
                required: false,
                where: { userId: userId, targetType: 'note' }
            });
        }

        const notes = await db.Note.findAll({
            where: whereClause,
            order: [['updatedAt', 'DESC']],
            limit: limit,
            include: include
        });

        // Add canDelete and canEdit for each note, and filter by permission using eager loaded data
        const notesWithPermissions = notes.map(note => {
            const noteData = note.toJSON();
            const isOwner = noteData.ownerId && noteData.ownerId === userId;

            // Resolve effective permission
            // Note: For lists, we don't query the Book to inherit permissions to keep it fast.
            // Notes in list view usually rely on their own permission or default private/public.
            // If strictly needed, we would need to join Book table too. 
            // For separate notes (bookId: null), inherit is not valid anyway.
            const effectivePermission = noteData.permission || 'private';

            // Check user permission from eager loaded data
            let userPermOverride = null;
            if (noteData.permissions && noteData.permissions.length > 0) {
                userPermOverride = noteData.permissions[0].permission;
            }

            // Remove permissions array from response
            delete noteData.permissions;

            // Filter out items the user cannot access
            // Private: only owner can see
            if (effectivePermission === 'private' && !isOwner) {
                // If direct user permission exists (e.g. shared with me), allow view
                if (!userPermOverride) return null;
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
            } else if (userPermOverride === 'edit') {
                canEdit = true;
                canDelete = true;
            } else if ((effectivePermission === 'public-edit' || effectivePermission === 'auth-edit' || effectivePermission === 'inherit') && userId) {
                // Note: 'inherit' in this context (without book check) acts as auth-edit for safety, 
                // but realistically standalone notes shouldn't have 'inherit'.
                canEdit = true;
                canDelete = true;
            } else if (effectivePermission === 'public-edit') {
                canEdit = true;
                canDelete = true;
            }

            return { ...noteData, isOwner, canEdit, canDelete };
        });

        // Filter out null entries (items user cannot access)
        res.json(notesWithPermissions.filter(n => n !== null));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Note Share ---

// Generate share link for a note (owner or editor only)
router.post('/notes/:id/share', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id, {
            include: [
                { model: db.Book, attributes: ['id', 'title', 'permission'] }
            ]
        });
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Check if user can share (owner or has edit permission)
        let canShare = false;
        if (isOwner) {
            canShare = true;
        } else if (userPermOverride === 'edit') {
            canShare = true;
        } else if (effectivePermission === 'public-edit' || effectivePermission === 'auth-edit') {
            canShare = true;
        }

        if (!canShare) {
            return res.status(403).json({ error: 'Permission denied. Only owner or editors can share.' });
        }

        // If shareId already exists, return it
        if (note.shareId) {
            return res.json({
                shareId: note.shareId,
                shareUrl: `/s/${note.shareId}`
            });
        }

        // Generate new shareId with retry logic
        let shareId = generateShareId();
        let retry = 0;
        while (retry < 5) {
            try {
                await note.update({ shareId });
                return res.json({
                    shareId,
                    shareUrl: `/s/${shareId}`
                });
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    shareId = generateShareId();
                    retry++;
                } else {
                    throw e;
                }
            }
        }
        res.status(500).json({ error: 'Failed to generate unique share ID' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reset share link for a note (generate new shareId, old link becomes invalid)
router.delete('/notes/:id/share', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id, {
            include: [
                { model: db.Book, attributes: ['id', 'title', 'permission'] }
            ]
        });
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Check if user can reset share link (owner or has edit permission)
        let canShare = false;
        if (isOwner) {
            canShare = true;
        } else if (userPermOverride === 'edit') {
            canShare = true;
        } else if (effectivePermission === 'public-edit' || effectivePermission === 'auth-edit') {
            canShare = true;
        }

        if (!canShare) {
            return res.status(403).json({ error: 'Permission denied. Only owner or editors can reset share link.' });
        }

        // Generate new shareId
        let shareId = generateShareId();
        let retry = 0;
        while (retry < 5) {
            try {
                await note.update({ shareId });
                return res.json({
                    shareId,
                    shareUrl: `/s/${shareId}`
                });
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    shareId = generateShareId();
                    retry++;
                } else {
                    throw e;
                }
            }
        }
        res.status(500).json({ error: 'Failed to generate unique share ID' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Set or clear share alias for a note (owner or editor only)
router.put('/notes/:id/alias', async (req, res) => {
    try {
        const note = await db.Note.findByPk(req.params.id);
        if (!note) return res.status(404).json({ error: 'Note not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = note.ownerId && note.ownerId === userId;
        const effectivePermission = await resolveNotePermission(note);
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Check if user can set alias (owner or has edit permission)
        let canSetAlias = false;
        if (isOwner) {
            canSetAlias = true;
        } else if (userPermOverride === 'edit') {
            canSetAlias = true;
        } else if (effectivePermission === 'public-edit' || effectivePermission === 'auth-edit') {
            canSetAlias = true;
        }

        if (!canSetAlias) {
            return res.status(403).json({ error: 'Permission denied. Only owner or editors can set alias.' });
        }

        const { alias } = req.body;

        // If alias is null/empty, clear the alias
        if (!alias || alias.trim() === '') {
            await note.update({ shareAlias: null });
            return res.json({ success: true, shareAlias: null });
        }

        const trimmedAlias = alias.trim().toLowerCase();

        // Validate alias format: alphanumeric, hyphens, underscores, 1-64 chars
        const aliasRegex = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$|^[a-z0-9]$/;
        if (!aliasRegex.test(trimmedAlias)) {
            return res.status(400).json({
                error: '別名格式不正確。只能使用小寫英文、數字、連字號(-)和底線(_)，長度1-64字元，開頭結尾需為英數字。'
            });
        }

        // Check uniqueness: must not conflict with any existing shareId OR shareAlias
        const conflictNote = await db.Note.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { shareId: trimmedAlias },
                    { shareAlias: trimmedAlias }
                ],
                id: { [db.Sequelize.Op.ne]: note.id } // Exclude current note
            }
        });

        if (conflictNote) {
            return res.status(409).json({ error: '此別名已被其他筆記使用，請選擇其他名稱。' });
        }

        await note.update({ shareAlias: trimmedAlias });
        res.json({
            success: true,
            shareAlias: trimmedAlias,
            aliasUrl: `/s/${trimmedAlias}`
        });
    } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: '此別名已被其他筆記使用，請選擇其他名稱。' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Get note by share ID or alias (permission check same as note view)
router.get('/share/:shareIdOrAlias', async (req, res) => {
    try {
        const param = req.params.shareIdOrAlias;
        // Find by shareId OR shareAlias using Sequelize Op.or
        const note = await db.Note.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { shareId: param },
                    { shareAlias: param }
                ]
            },
            include: [
                {
                    model: db.Book,
                    attributes: ['id', 'title', 'permission', 'shareId', 'shareAlias'],
                    include: [
                        { model: db.Note, attributes: ['id', 'title', 'order', 'shareId', 'shareAlias', 'noteType'], order: [['order', 'ASC']] }
                    ]
                },
                { model: db.User, as: 'owner', attributes: ['id', 'username', 'name', 'avatar'] },
                { model: db.User, as: 'lastEditor', attributes: ['id', 'username', 'name', 'avatar'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username', 'name', 'avatar'] }
            ]
        });
        if (!note) return res.status(404).json({ error: 'Share link not found' });

        const userId = req.session.userId || null;
        const isOwner = note.ownerId && note.ownerId === userId;

        // Resolve effective permission (handle 'inherit' from book)
        const effectivePermission = await resolveNotePermission(note);

        // Check user-specific permission override
        const userPermOverride = await getUserPermission('note', note.id, userId);

        // Permission check (same as GET /notes/:id)
        if (effectivePermission === 'private') {
            if (!isOwner && !userPermOverride) {
                if (!userId) {
                    return res.status(401).json({ error: 'Login required' });
                }
                return res.status(403).json({ error: 'Access denied' });
            }
        } else if (effectivePermission === 'auth-view' || effectivePermission === 'auth-edit') {
            if (!userId) {
                return res.status(401).json({ error: 'Login required' });
            }
        }

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

// --- Books ---

/**
 * @swagger
 * /api/books:
 *   post:
 *     summary: 建立新書本
 *     description: 建立新的書本，可設定權限與公開狀態
 *     tags: [Books]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               permission:
 *                 type: string
 *                 enum: [private, public-view, public-edit, auth-view, auth-edit]
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 建立成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 shareId:
 *                   type: string
 *       401:
 *         description: 未認證
 */
// Create Book
router.post('/books', async (req, res) => {
    if (!req.session.userId && !req.isMasterApiKey) {
        return res.status(401).json({ error: 'Login required' });
    }

    // Validate permission if provided
    const { permission, isPublic } = req.body || {};
    if (permission !== undefined) {
        if (!VALID_BOOK_PERMISSIONS.includes(permission)) {
            return res.status(400).json({
                error: `Invalid permission. Must be one of: ${VALID_BOOK_PERMISSIONS.join(', ')}`
            });
        }
    }
    if (isPublic !== undefined && typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: 'isPublic must be a boolean' });
    }

    let id = generateId();
    let shareId = generateId(7);
    let retry = 0;
    while (retry < 5) {
        try {
            const bookData = {
                id: id,
                title: (req.body && req.body.title) || 'Untitled Book',
                description: (req.body && req.body.description) || '',
                ownerId: req.session.userId || null,
                shareId: shareId  // Auto-generated share link
            };
            // Add optional fields if provided
            if (permission !== undefined) bookData.permission = permission;
            if (isPublic !== undefined) bookData.isPublic = isPublic;

            const book = await db.Book.create(bookData);
            // Update user's lastActiveAt
            if (req.session.userId) {
                db.User.update({ lastActiveAt: new Date() }, { where: { id: req.session.userId } }).catch(() => { });
            }
            return res.json(book);
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                id = generateId();
                shareId = generateId(7);
                retry++;
            } else {
                return res.status(500).json({ error: e.message });
            }
        }
    }
    res.status(500).json({ error: 'Failed to generate unique ID' });
});

/**
 * @swagger
 * /api/books/{id}:
 *   get:
 *     summary: 取得特定書本
 *     description: 取得書本詳情及其包含的筆記列表
 *     tags: [Books]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 書本 ID
 *     responses:
 *       200:
 *         description: 書本詳情 (含筆記)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 title:
 *                   type: string
 *                 Notes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                 isOwner:
 *                   type: boolean
 *                 canEdit:
 *                   type: boolean
 *       403:
 *         description: 沒有存取權限
 *       404:
 *         description: 書本不存在
 */
// Get Book with Notes
router.get('/books/:id', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id, {
            include: [
                {
                    model: db.Note,
                    attributes: ['id', 'title', 'bookId', 'permission', 'order', 'tags', 'createdAt', 'lastEditedAt', 'lastEditorId', 'updatedAt', 'lastUpdaterId', 'deletedById', 'savedAt', 'noteType', 'shareId', 'shareAlias', 'commentsEnabled', 'isPublic', 'ownerId'],
                    include: [
                        { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                        { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] }
                    ]
                },
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

        // Enhance notes with canEdit property
        const notes = book.Notes ? book.Notes.map(note => {
            const noteData = note.toJSON();
            let noteCanEdit = false;

            // 1. Owner always can edit
            if (isOwner || (userId && noteData.ownerId === userId)) {
                noteCanEdit = true;
            }
            // 2. Inherit from book (if book is editable)
            else if (noteData.permission === 'inherit' && canEdit) {
                noteCanEdit = true;
            }
            // 3. Public/Auth edit explicit
            else if (noteData.permission === 'public-edit') {
                noteCanEdit = true;
            }
            else if (noteData.permission === 'auth-edit' && userId) {
                noteCanEdit = true;
            }

            return { ...noteData, canEdit: noteCanEdit };
        }) : [];

        res.json({
            ...book.toJSON(),
            Notes: notes, // Replace Notes with enhanced notes
            isOwner,
            canEdit,
            canAddNote
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/books/{id}:
 *   put:
 *     summary: 更新書本
 *     description: 更新書本標題、描述 (不含權限)
 *     tags: [Books]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 書本 ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 更新成功
 *       403:
 *         description: 沒有編輯權限
 *       404:
 *         description: 書本不存在
 */
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
        let shareId = generateId(7);
        let retry = 0;
        while (retry < 5) {
            try {
                const now = new Date();
                const note = await db.Note.create({
                    id: id,
                    title: (req.body && req.body.title) || 'Untitled Note',
                    content: (req.body && req.body.content) || '',
                    noteType: (req.body && req.body.noteType) || 'markdown',
                    diagramData: (req.body && req.body.diagramData) || null,
                    bookId: book.id,
                    ownerId: userId,
                    permission: 'inherit', // Default to inherit from book
                    order: newOrder,
                    shareId: shareId,  // Auto-generate share link
                    lastEditedAt: now,
                    lastEditorId: userId,
                    lastUpdaterId: userId,
                    updatedAt: now
                });
                // Update user's lastActiveAt
                if (userId) {
                    db.User.update({ lastActiveAt: new Date() }, { where: { id: userId } }).catch(() => { });
                }
                return res.json(note);
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    id = generateId();
                    shareId = generateId(7);
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

/**
 * @swagger
 * /api/books:
 *   get:
 *     summary: 取得書本列表
 *     description: 取得所有可見的書本列表
 *     tags: [Books]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 1000
 *         description: 限制回傳數量
 *     responses:
 *       200:
 *         description: 書本列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   isOwner:
 *                     type: boolean
 *                   canEdit:
 *                     type: boolean
 *                   noteCount:
 *                     type: integer
 */
// Get All Books (Home)
router.get('/books', async (req, res) => {
    try {
        const userId = req.session.userId || null;
        const books = await db.Book.findAll({
            where: { isSystem: false },
            order: [['updatedAt', 'DESC']],
            limit: 1000,
            include: [
                { model: db.User, as: 'owner', attributes: ['id', 'username'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username'] },
                { model: db.Note, attributes: ['id'] }
            ]
        });

        // Add canDelete, canEdit, and noteCount for each book, and filter by permission
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

            // Calculate noteCount and remove Notes array to keep response clean
            const noteCount = bookData.Notes ? bookData.Notes.length : 0;
            delete bookData.Notes;

            return { ...bookData, isOwner, canEdit, canDelete, noteCount };
        });

        // Filter out null entries (items user cannot access)
        res.json(booksWithPermissions.filter(b => b !== null));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/books/{id}:
 *   delete:
 *     summary: 刪除書本
 *     description: 將書本移至垃圾桶 (軟刪除)
 *     tags: [Books]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 書本 ID
 *     responses:
 *       200:
 *         description: 刪除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       403:
 *         description: 沒有刪除權限
 *       404:
 *         description: 書本不存在
 */
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
        // Update user's lastActiveAt
        if (userId) {
            db.User.update({ lastActiveAt: new Date() }, { where: { id: userId } }).catch(() => { });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Restore Book
router.post('/books/:id/restore', async (req, res) => {
    try {
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }
        const book = await db.Book.findByPk(req.params.id, { paranoid: false });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.ownerId !== req.session.userId && !req.isMasterApiKey) {
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
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }
        const book = await db.Book.findByPk(req.params.id, { paranoid: false });
        if (!book) return res.status(404).json({ error: 'Book not found' });
        if (book.ownerId !== req.session.userId && !req.isMasterApiKey) {
            return res.status(403).json({ error: 'Only owner can force delete' });
        }
        await book.destroy({ force: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Book Share ---

// Generate share link for a book (owner or editor only)
router.post('/books/:id/share', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';
        const userPermOverride = await getUserPermission('book', book.id, userId);

        // Check if user can share (owner or has edit permission)
        let canShare = false;
        if (isOwner) {
            canShare = true;
        } else if (userPermOverride === 'edit') {
            canShare = true;
        } else if (permission === 'public-edit' || permission === 'auth-edit') {
            canShare = true;
        }

        if (!canShare) {
            return res.status(403).json({ error: 'Permission denied. Only owner or editors can share.' });
        }

        // If shareId already exists, return it
        if (book.shareId) {
            return res.json({
                shareId: book.shareId,
                shareUrl: `/v/${book.shareId}`
            });
        }

        // Generate new shareId with retry logic
        let shareId = generateShareId();
        let retry = 0;
        while (retry < 5) {
            try {
                await book.update({ shareId });
                return res.json({
                    shareId,
                    shareUrl: `/v/${shareId}`
                });
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    shareId = generateShareId();
                    retry++;
                } else {
                    throw e;
                }
            }
        }
        res.status(500).json({ error: 'Failed to generate unique share ID' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Reset share link for a book (generate new shareId, old link becomes invalid)
router.delete('/books/:id/share', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';
        const userPermOverride = await getUserPermission('book', book.id, userId);

        // Check if user can reset share link (owner or has edit permission)
        let canShare = false;
        if (isOwner) {
            canShare = true;
        } else if (userPermOverride === 'edit') {
            canShare = true;
        } else if (permission === 'public-edit' || permission === 'auth-edit') {
            canShare = true;
        }

        if (!canShare) {
            return res.status(403).json({ error: 'Permission denied. Only owner or editors can reset share link.' });
        }

        // Generate new shareId
        let shareId = generateShareId();
        let retry = 0;
        while (retry < 5) {
            try {
                await book.update({ shareId });
                return res.json({
                    shareId,
                    shareUrl: `/v/${shareId}`
                });
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    shareId = generateShareId();
                    retry++;
                } else {
                    throw e;
                }
            }
        }
        res.status(500).json({ error: 'Failed to generate unique share ID' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get book by share ID (for public sharing page)
router.get('/book-share/:shareId', async (req, res) => {
    try {
        const param = req.params.shareId;
        const book = await db.Book.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { shareId: param },
                    { shareAlias: param }
                ]
            },
            include: [
                {
                    model: db.Note,
                    attributes: ['id', 'title', 'order', 'shareId', 'shareAlias', 'tags', 'lastEditedAt', 'noteType'],
                    order: [['order', 'ASC']],
                    include: [
                        { model: db.User, as: 'lastEditor', attributes: ['id', 'username'] }
                    ]
                },
                { model: db.User, as: 'owner', attributes: ['id', 'username', 'name', 'avatar'] },
                { model: db.User, as: 'lastUpdater', attributes: ['id', 'username', 'name', 'avatar'] }
            ],
            order: [[db.Note, 'order', 'ASC']]
        });
        if (!book) return res.status(404).json({ error: 'Share link not found' });

        const userId = req.session.userId || null;
        const isOwner = book.ownerId && book.ownerId === userId;
        const permission = book.permission || 'private';

        // Check user-specific permission override
        const userPermOverride = await getUserPermission('book', book.id, userId);

        // Permission check
        if (permission === 'private') {
            if (!isOwner && !userPermOverride) {
                if (!userId) {
                    return res.status(401).json({ error: 'Login required' });
                }
                return res.status(403).json({ error: 'Access denied' });
            }
        } else if (permission === 'auth-view' || permission === 'auth-edit') {
            if (!userId) {
                return res.status(401).json({ error: 'Login required' });
            }
        }

        // Determine if user can edit
        let canEdit = false;
        if (isOwner) {
            canEdit = true;
        } else if (userPermOverride === 'edit') {
            canEdit = true;
        } else if (permission === 'public-edit') {
            canEdit = true;
        } else if (permission === 'auth-edit' && userId) {
            canEdit = true;
        }

        res.json({
            ...book.toJSON(),
            isOwner,
            canEdit
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Set share alias for a book
router.put('/books/:id/alias', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        const userPermOverride = await getUserPermission('book', book.id, userId);

        // Only owner or explicitly allowed editor can set alias
        if (!isOwner && userPermOverride !== 'edit') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { alias } = req.body;
        if (!alias || !/^[a-z0-9_-]+$/.test(alias)) {
            return res.status(400).json({ error: 'Invalid alias format. Use lowercase letters, numbers, hyphens, and underscores only.' });
        }

        // Check uniqueness against both Note and Book aliases/shareIds
        const existingNote = await db.Note.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { shareId: alias },
                    { shareAlias: alias }
                ]
            }
        });
        if (existingNote) return res.status(409).json({ error: '此別名已被筆記使用，請選擇其他名稱。' });

        const existingBook = await db.Book.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { shareId: alias },
                    { shareAlias: alias }
                ],
                id: { [db.Sequelize.Op.ne]: book.id } // Exclude self
            }
        });
        if (existingBook) return res.status(409).json({ error: '此別名已被其他書本使用，請選擇其他名稱。' });

        await book.update({ shareAlias: alias });
        res.json({
            shareAlias: alias,
            aliasUrl: `/v/${alias}`
        });
    } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: '此別名已被使用，請選擇其他名稱。' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Clear share alias for a book
router.delete('/books/:id/alias', async (req, res) => {
    try {
        const book = await db.Book.findByPk(req.params.id);
        if (!book) return res.status(404).json({ error: 'Book not found' });

        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Login required' });

        const isOwner = book.ownerId && book.ownerId === userId;
        const userPermOverride = await getUserPermission('book', book.id, userId);

        if (!isOwner && userPermOverride !== 'edit') {
            return res.status(403).json({ error: 'Access denied' });
        }

        await book.update({ shareAlias: null });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Trash ---

/**
 * @swagger
 * /api/notes/{id}:
 *   delete:
 *     summary: 刪除筆記
 *     description: 將筆記移至垃圾桶 (軟刪除)
 *     tags: [Notes]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 筆記 ID
 *     responses:
 *       200:
 *         description: 刪除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       403:
 *         description: 沒有刪除權限
 *       404:
 *         description: 筆記不存在
 */
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
        // Update user's lastActiveAt
        if (userId) {
            db.User.update({ lastActiveAt: new Date() }, { where: { id: userId } }).catch(() => { });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Restore Note
router.post('/notes/:id/restore', async (req, res) => {
    try {
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }
        const note = await db.Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        if (note.ownerId !== req.session.userId && !req.isMasterApiKey) {
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
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }
        const note = await db.Note.findByPk(req.params.id, { paranoid: false });
        if (!note) return res.status(404).json({ error: 'Note not found' });
        if (note.ownerId !== req.session.userId && !req.isMasterApiKey) {
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
        if (!req.session.userId && !req.isMasterApiKey) {
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
        res.json({ notes, books, autoDeleteDays: config.trash.autoDeleteDays });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Comments ---

// Get feature config (public)
router.get('/config/features', (req, res) => {
    const features = {
        comments: config.features?.comments !== false,
        noteReactions: config.features?.noteReactions !== false,
        // Draw.io URL for flowchart editor (from environment or default to public service)
        drawioUrl: process.env.DRAWIO_URL || 'https://embed.diagrams.net'
    };
    res.json(features);
});

// Get comments for a note
router.get('/notes/:id/comments', async (req, res) => {
    try {
        const userId = req.session.userId || null;

        const comments = await db.Comment.findAll({
            where: { noteId: req.params.id },
            include: [
                { model: db.User, as: 'user', attributes: ['id', 'username', 'name', 'avatar', 'role'] },
                { model: db.CommentReaction, as: 'reactions' }
            ],
            order: [['createdAt', 'ASC']]
        });

        // Process comments to add reaction counts and user's reaction
        const processedComments = comments.map(comment => {
            const c = comment.toJSON();

            // Count reactions by type
            const reactionCounts = {};
            let userReaction = null;  // Single value instead of array

            if (c.reactions && Array.isArray(c.reactions)) {
                for (const r of c.reactions) {
                    reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
                    if (userId && r.userId === userId) {
                        userReaction = r.type;  // Only one reaction per user
                    }
                }
            }

            // Remove raw reactions array, return summary
            delete c.reactions;
            c.reactionCounts = reactionCounts;
            c.userReaction = userReaction;  // Single value

            return c;
        });

        res.json(processedComments);
    } catch (e) {
        console.error('Get comments error:', e.message);
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
        if (note.commentsEnabled === false) {
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

        // Trigger webhook (async, non-blocking)
        if (config.webhook?.commentUrl) {
            // Fetch note with owner and lastEditor for webhook
            const noteWithDetails = await db.Note.findByPk(req.params.id, {
                include: [
                    { model: db.User, as: 'owner', attributes: ['id', 'username', 'name'] },
                    { model: db.User, as: 'lastEditor', attributes: ['id', 'username', 'name'] }
                ]
            });

            // If reply, fetch parent comment with user
            let parentCommentWithUser = null;
            if (parentId) {
                parentCommentWithUser = await db.Comment.findByPk(parentId, {
                    include: [
                        { model: db.User, as: 'user', attributes: ['id', 'username', 'name'] }
                    ]
                });
            }

            sendCommentWebhook(noteWithDetails, commentWithUser, parentCommentWithUser);
        }

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

        // Delete all replies (child comments) first
        await db.Comment.destroy({
            where: { parentId: comment.id }
        });

        // Delete the comment itself
        await comment.destroy();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Comment Reactions ---

// Add reaction to a comment (toggle: if exists, remove it)
router.post('/comments/:id/reactions', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const { type } = req.body;
        const validTypes = ['like', 'ok', 'laugh', 'surprise', 'sad'];
        if (!type || !validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid reaction type' });
        }

        const comment = await db.Comment.findByPk(req.params.id);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        // Check if user has same reaction already (toggle off)
        const existingSame = await db.CommentReaction.findOne({
            where: {
                commentId: req.params.id,
                userId: req.session.userId,
                type
            }
        });

        if (existingSame) {
            // Toggle off - remove the reaction
            await existingSame.destroy();
            res.json({ action: 'removed', type });
        } else {
            // Remove any existing reaction from this user on this comment (only one reaction allowed)
            await db.CommentReaction.destroy({
                where: {
                    commentId: req.params.id,
                    userId: req.session.userId
                }
            });

            // Add new reaction
            await db.CommentReaction.create({
                commentId: req.params.id,
                userId: req.session.userId,
                type
            });
            res.json({ action: 'added', type });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Remove specific reaction from a comment
router.delete('/comments/:id/reactions/:type', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        const { type } = req.params;
        const validTypes = ['like', 'ok', 'laugh', 'surprise', 'sad'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid reaction type' });
        }

        const reaction = await db.CommentReaction.findOne({
            where: {
                commentId: req.params.id,
                userId: req.session.userId,
                type
            }
        });

        if (!reaction) {
            return res.status(404).json({ error: 'Reaction not found' });
        }

        await reaction.destroy();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Note Reactions ---

// Get note reactions (summary + user's reaction)
router.get('/notes/:id/reactions', async (req, res) => {
    try {
        // Check if feature is enabled
        if (config.features?.noteReactions === false) {
            return res.status(403).json({ error: 'Note reactions feature is disabled' });
        }

        const note = await db.Note.findByPk(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const userId = req.session.userId || null;

        // Get all reactions for this note with user info
        const reactions = await db.NoteReaction.findAll({
            where: { noteId: req.params.id },
            include: [
                { model: db.User, as: 'user', attributes: ['id', 'username', 'name'] }
            ]
        });

        // Count reactions by type and collect user names
        const reactionCounts = {};
        const reactionUsers = {};  // { type: [{ id, username, name }, ...] }
        let userReaction = null;

        for (const r of reactions) {
            reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;

            // Collect user info for each type
            if (!reactionUsers[r.type]) {
                reactionUsers[r.type] = [];
            }
            if (r.user) {
                reactionUsers[r.type].push({
                    id: r.user.id,
                    username: r.user.username,
                    name: r.user.name || r.user.username
                });
            }

            if (userId && r.userId === userId) {
                userReaction = r.type;
            }
        }

        res.json({ reactionCounts, reactionUsers, userReaction });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/notes/{id}/reactions:
 *   post:
 *     summary: 對筆記按讚或表達心情
 *     description: 切換對筆記的反應 (Like, OK, Laugh, Surprise, Sad)。若已存在相同反應則會取消 (Toggle)。
 *     tags: [Notes]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 筆記 ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [like, ok, laugh, surprise, sad]
 *                 description: 反應類型
 *     responses:
 *       200:
 *         description: 成功切換
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 action:
 *                   type: string
 *                   enum: [added, removed]
 *                 type:
 *                   type: string
 *       400:
 *         description: 無效的反應類型
 *       401:
 *         description: 未登入
 *       403:
 *         description: 此功能已停用
 *       404:
 *         description: 筆記不存在
 */
// Toggle note reaction (add/remove/change)
router.post('/notes/:id/reactions', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Login required' });
        }

        // Check if feature is enabled
        if (config.features?.noteReactions === false) {
            return res.status(403).json({ error: 'Note reactions feature is disabled' });
        }

        const { type } = req.body;
        const validTypes = ['like', 'ok', 'laugh', 'surprise', 'sad'];
        if (!type || !validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid reaction type' });
        }

        const note = await db.Note.findByPk(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Check if user has same reaction already (toggle off)
        const existingSame = await db.NoteReaction.findOne({
            where: {
                noteId: req.params.id,
                userId: req.session.userId,
                type
            }
        });

        if (existingSame) {
            // Toggle off - remove the reaction
            await existingSame.destroy();
            res.json({ action: 'removed', type });
        } else {
            // Remove any existing reaction from this user on this note (only one reaction allowed)
            await db.NoteReaction.destroy({
                where: {
                    noteId: req.params.id,
                    userId: req.session.userId
                }
            });

            // Add new reaction
            await db.NoteReaction.create({
                noteId: req.params.id,
                userId: req.session.userId,
                type
            });
            res.json({ action: 'added', type });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Export ---

// Export user's notes as ZIP
const archiver = require('archiver');

// Helper function to sanitize filename
function sanitizeFilename(name) {
    if (!name) return 'Untitled';
    // Remove invalid characters for Windows/Unix filenames
    return name.replace(/[\/\\:*?"<>|]/g, '_').trim() || 'Untitled';
}

router.get('/export/my-notes', async (req, res) => {
    try {
        // Check login
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }

        const userId = req.session.userId;

        // Get all notes owned by the user
        const notes = await db.Note.findAll({
            where: { ownerId: userId },
            include: [
                { model: db.Book, attributes: ['id', 'title'] }
            ],
            order: [['updatedAt', 'DESC']]
        });

        if (notes.length === 0) {
            return res.status(400).json({ error: 'No notes to export' });
        }

        // Set headers for ZIP download
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const zipFilename = `notes_export_${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        // Create archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        // Handle archive errors
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create archive' });
            }
        });

        // Pipe archive to response
        archive.pipe(res);

        // Track filenames to avoid duplicates
        const filenameCount = {};

        // Add notes to archive
        for (const note of notes) {
            const noteTitle = sanitizeFilename(note.title);
            const noteId = note.id;
            const isWhiteboard = note.noteType === 'excalidraw';
            let filename;

            if (note.Book) {
                // Note is in a book: {bookTitle}_{bookID}/{order}_{noteTitle}_{noteID}
                const bookTitle = sanitizeFilename(note.Book.title);
                const bookId = note.Book.id;
                // Zero-pad order to 2 digits for proper sorting (e.g., 01, 02, 10)
                const orderNum = String(note.order + 1).padStart(2, '0');
                filename = `${bookTitle}_${bookId}/${orderNum}_${noteTitle}_${noteId}`;
            } else {
                // Standalone note: {noteTitle}_{noteID}
                filename = `${noteTitle}_${noteId}`;
            }

            // Handle duplicate filenames (shouldn't happen with ID, but just in case)
            if (filenameCount[filename]) {
                filenameCount[filename]++;
                filename = `${filename}_${filenameCount[filename]}`;
            } else {
                filenameCount[filename] = 1;
            }

            // Add appropriate extension based on note type
            if (isWhiteboard) {
                filename = `${filename}.excalidraw`;
                // Export diagram data in standard Excalidraw format
                let diagramData = {};
                try {
                    diagramData = JSON.parse(note.content || '{}');
                } catch (e) {
                    console.error('Failed to parse excalidraw content for export', e);
                    diagramData = { elements: [], appState: {}, files: {} };
                }

                const exportData = {
                    type: 'excalidraw',
                    version: 2,
                    source: 'NoteHubMD',
                    elements: diagramData.elements || [],
                    appState: {
                        ...(diagramData.appState || {}),
                        viewBackgroundColor: diagramData.appState?.viewBackgroundColor || '#ffffff',
                        currentItemFontFamily: diagramData.appState?.currentItemFontFamily || 1
                    },
                    files: diagramData.files || {}
                };
                const content = JSON.stringify(exportData, null, 2);
                archive.append(content, { name: filename });
            } else if (note.noteType === 'drawio') {
                filename = `${filename}.drawio`;
                // Export Draw.io XML
                let diagramData = {};
                try {
                    diagramData = JSON.parse(note.content || '{}');
                } catch (e) {
                    console.error('Failed to parse drawio content for export', e);
                    diagramData = { xml: '' };
                }
                const xmlContent = diagramData.xml || '';
                archive.append(xmlContent, { name: filename });
            } else {
                filename = `${filename}.md`;
                archive.append(note.content || '', { name: filename });
            }
        }

        // Finalize the archive
        await archive.finalize();

    } catch (e) {
        console.error('Export error:', e);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        }
    }
});

// --- Import ---

// Import notes from .md or .zip file
const AdmZip = require('adm-zip');

// Configure multer storage for import (temp file)
const importStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const importTempDir = path.join(__dirname, '../../../_uploads/import_temp');
        if (!fs.existsSync(importTempDir)) {
            fs.mkdirSync(importTempDir, { recursive: true });
        }
        cb(null, importTempDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `import_${timestamp}${ext}`);
    }
});

const importUpload = multer({
    storage: importStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.md' || ext === '.zip' || ext === '.excalidraw' || ext === '.drawio') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only .md, .excalidraw, .drawio and .zip are allowed.'));
        }
    }
});

// Parse filename to determine note title
// New format: {order}_{noteTitle}_{noteID}.md/excalidraw (for book notes)
// Standalone format: {noteTitle}_{noteID}.md/excalidraw
function parseImportFilename(filename) {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(md|excalidraw|drawio)$/i, '');

    // Check for book note format: order_noteTitle_noteID (where order is 2-digit number)
    const bookNoteMatch = nameWithoutExt.match(/^(\d{2})_(.+)_([a-zA-Z0-9]+)$/);
    if (bookNoteMatch) {
        return {
            isBookNote: true,
            order: parseInt(bookNoteMatch[1], 10),
            noteTitle: bookNoteMatch[2].trim()
        };
    }

    // Standalone note format: noteTitle_noteID
    const standaloneMatch = nameWithoutExt.match(/^(.+)_([a-zA-Z0-9]+)$/);
    if (standaloneMatch) {
        return {
            isBookNote: false,
            noteTitle: standaloneMatch[1].trim() || 'Untitled'
        };
    }

    // Fallback: use entire filename as title
    return {
        isBookNote: false,
        noteTitle: nameWithoutExt.trim() || 'Untitled'
    };
}

// Parse book folder name: {bookTitle}_{bookID}
function parseBookFolderName(folderName) {
    const match = folderName.match(/^(.+)_([a-zA-Z0-9]+)$/);
    if (match) {
        return {
            bookTitle: match[1].trim()
        };
    }
    // Fallback: use entire folder name as title
    return {
        bookTitle: folderName.trim() || 'Untitled Book'
    };
}

router.post('/import/notes', importUpload.single('file'), async (req, res) => {
    try {
        // Check login
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const userId = req.session.userId;
        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();

        // bookNotes: { bookTitle: [{ order, noteTitle, content, type }] }
        const bookNotes = {};
        // standaloneNotes: [{ noteTitle, content, type }]
        const standaloneNotes = [];

        const isZip = ext === '.zip';

        if (isZip) {
            // Extract files from zip - new folder structure format
            // Structure: {bookTitle}_{bookID}/{order}_{noteTitle}_{noteID}.md
            //           {noteTitle}_{noteID}.md (standalone)
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();

            for (const entry of entries) {
                if (entry.isDirectory) continue;

                const entryNameLower = entry.entryName.toLowerCase();
                const isMd = entryNameLower.endsWith('.md');
                const isExcalidraw = entryNameLower.endsWith('.excalidraw');
                const isDrawio = entryNameLower.endsWith('.drawio');

                if (!isMd && !isExcalidraw && !isDrawio) continue;

                const entryPath = entry.entryName;
                const pathParts = entryPath.split('/').filter(p => p);
                const filename = path.basename(entryPath);
                const content = entry.getData().toString('utf8');
                const fileType = isExcalidraw ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown');

                if (pathParts.length >= 2) {
                    // File is inside a folder -> book note
                    const folderName = pathParts[0];
                    const { bookTitle } = parseBookFolderName(folderName);
                    const parsed = parseImportFilename(filename);

                    if (!bookNotes[bookTitle]) {
                        bookNotes[bookTitle] = [];
                    }
                    bookNotes[bookTitle].push({
                        order: parsed.order || bookNotes[bookTitle].length,
                        noteTitle: parsed.noteTitle,
                        content,
                        type: fileType
                    });
                } else {
                    // File is at root -> standalone note
                    const parsed = parseImportFilename(filename);
                    standaloneNotes.push({
                        noteTitle: parsed.noteTitle,
                        content,
                        type: fileType
                    });
                }
            }
        } else {
            // Single file upload (.md, .excalidraw or .drawio)
            const isExcalidraw = ext === '.excalidraw';
            const isDrawio = ext === '.drawio';
            if (ext === '.md' || isExcalidraw || isDrawio) {
                const content = fs.readFileSync(filePath, 'utf8');
                const parsed = parseImportFilename(req.file.originalname);
                standaloneNotes.push({
                    noteTitle: parsed.noteTitle,
                    content,
                    type: isExcalidraw ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown')
                });
            }
        }

        // Clean up temp file
        fs.unlinkSync(filePath);

        if (Object.keys(bookNotes).length === 0 && standaloneNotes.length === 0) {
            return res.status(400).json({ error: 'No valid files (.md, .excalidraw or .drawio) found' });
        }

        // Create books and notes
        const createdBooks = [];
        const createdNotes = [];

        // Create books
        for (const bookTitle of Object.keys(bookNotes)) {
            // Always create new book
            let bookId = generateId();
            let retry = 0;
            let book = null;

            while (retry < 5) {
                try {
                    book = await db.Book.create({
                        id: bookId,
                        title: bookTitle,
                        ownerId: userId
                    });
                    break;
                } catch (e) {
                    if (e.name === 'SequelizeUniqueConstraintError') {
                        bookId = generateId();
                        retry++;
                    } else {
                        throw e;
                    }
                }
            }

            if (!book) {
                console.error(`Failed to create book: ${bookTitle}`);
                continue;
            }

            createdBooks.push({ id: book.id, title: book.title });

            // Sort notes by order and create them
            const notesToCreate = bookNotes[bookTitle].sort((a, b) => a.order - b.order);

            for (let i = 0; i < notesToCreate.length; i++) {
                const noteData = notesToCreate[i];
                let noteId = generateId();
                retry = 0;

                while (retry < 5) {
                    try {
                        const isWhiteboard = noteData.type === 'excalidraw';
                        const isDrawio = noteData.type === 'drawio';
                        let diagramData = null;
                        let noteContent = noteData.content;
                        let tags = [];

                        if (isWhiteboard) {
                            try {
                                // Ensure content is JSON string
                                let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                                // Verify it's valid JSON
                                JSON.parse(contentStr);
                                noteContent = contentStr;
                            } catch (e) {
                                console.error('Failed to parse excalidraw content', e);
                                noteContent = JSON.stringify({ elements: [], appState: {}, files: {} });
                            }
                        } else if (isDrawio) {
                            // Check if content is already JSON (e.g. from our export) or raw XML
                            let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                            if (contentStr.trim().startsWith('{')) {
                                try {
                                    JSON.parse(contentStr);
                                    noteContent = contentStr;
                                } catch (e) {
                                    // Not valid JSON, treat as XML
                                    noteContent = JSON.stringify({ xml: contentStr });
                                }
                            } else {
                                noteContent = JSON.stringify({ xml: contentStr });
                            }
                        } else {
                            tags = parseTags(noteData.content);
                        }

                        const note = await db.Note.create({
                            id: noteId,
                            title: noteData.noteTitle,
                            content: noteContent,
                            noteType: isWhiteboard ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown'),
                            tags: tags,
                            bookId: book.id,
                            order: i,
                            ownerId: userId,
                            shareId: generateShareId()
                        });
                        createdNotes.push({ id: note.id, title: note.title, bookId: book.id });
                        break;
                    } catch (e) {
                        if (e.name === 'SequelizeUniqueConstraintError') {
                            noteId = generateId();
                            retry++;
                        } else {
                            throw e;
                        }
                    }
                }
            }
        }

        // Create standalone notes
        for (const noteData of standaloneNotes) {
            let noteId = generateId();
            let retry = 0;

            while (retry < 5) {
                try {
                    const isWhiteboard = noteData.type === 'excalidraw';
                    const isDrawio = noteData.type === 'drawio';
                    let diagramData = null;
                    let noteContent = noteData.content;
                    let tags = [];

                    if (isWhiteboard) {
                        try {
                            // Ensure content is JSON string
                            let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                            // Verify it's valid JSON
                            JSON.parse(contentStr);
                            noteContent = contentStr;
                        } catch (e) {
                            console.error('Failed to parse excalidraw content', e);
                            noteContent = JSON.stringify({ elements: [], appState: {}, files: {} });
                        }
                    } else if (isDrawio) {
                        // Check if content is already JSON or raw XML
                        let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                        if (contentStr.trim().startsWith('{')) {
                            try {
                                JSON.parse(contentStr);
                                noteContent = contentStr;
                            } catch (e) {
                                noteContent = JSON.stringify({ xml: contentStr });
                            }
                        } else {
                            noteContent = JSON.stringify({ xml: contentStr });
                        }
                    } else {
                        tags = parseTags(noteData.content);
                    }

                    const note = await db.Note.create({
                        id: noteId,
                        title: noteData.noteTitle,
                        content: noteContent,
                        noteType: isWhiteboard ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown'),
                        tags: tags,
                        ownerId: userId,
                        shareId: generateShareId()
                    });
                    createdNotes.push({ id: note.id, title: note.title });
                    break;
                } catch (e) {
                    if (e.name === 'SequelizeUniqueConstraintError') {
                        noteId = generateId();
                        retry++;
                    } else {
                        throw e;
                    }
                }
            }
        }

        res.json({
            success: true,
            stats: {
                books: createdBooks.length,
                notes: createdNotes.length
            },
            created: {
                books: createdBooks,
                notes: createdNotes
            }
        });

    } catch (e) {
        console.error('Import error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Import notes from folder (multiple .md files)
const importFolderUpload = multer({
    storage: multer.memoryStorage(), // Use memory storage for folder uploads
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max total
    fileFilter: (req, file, cb) => {
        const lowerName = file.originalname.toLowerCase();
        if (lowerName.endsWith('.md') || lowerName.endsWith('.excalidraw') || lowerName.endsWith('.drawio')) {
            cb(null, true);
        } else {
            cb(null, false); // Silently skip
        }
    }
});

router.post('/import/notes-folder', importFolderUpload.array('files', 500), async (req, res) => {
    try {
        // Check login
        if (!req.session.userId && !req.isMasterApiKey) {
            return res.status(401).json({ error: 'Login required' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No .md files found' });
        }

        const userId = req.session.userId;

        // Get paths from the separate JSON field
        let paths = [];
        if (req.body.paths) {
            try {
                paths = JSON.parse(req.body.paths);
            } catch (e) {
                console.error('[Import Folder] Failed to parse paths:', e);
            }
        }

        // Group notes by book based on folder structure
        const bookNotes = {};
        const standaloneNotes = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            // Use the path from the paths array (already UTF-8 from JSON), 
            // fallback to originalname (needs Latin-1 to UTF-8 conversion)
            const originalPath = paths[i]
                ? paths[i]  // Already UTF-8 from JSON.parse
                : Buffer.from(file.originalname, 'latin1').toString('utf8');
            const content = file.buffer.toString('utf8');
            const isExcalidraw = originalPath.toLowerCase().endsWith('.excalidraw');
            const isDrawio = originalPath.toLowerCase().endsWith('.drawio');
            const fileType = isExcalidraw ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown');

            // Parse path: webkitRelativePath format is "rootFolder/bookFolder/file.md"
            // or "rootFolder/file.md" for standalone notes at root of selected folder
            const pathParts = originalPath.split(/[\/\\]/).filter(p => p);
            const filename = pathParts[pathParts.length - 1];

            // pathParts[0] is the selected root folder (always present)
            // pathParts[1] could be a subfolder (book) or the file itself
            // If length >= 3: rootFolder/bookFolder/file.md -> book note
            // If length == 2: rootFolder/file.md -> standalone note
            // If length == 1: file.md (fallback) -> standalone note
            if (pathParts.length >= 3) {
                // File is inside a subfolder -> book note
                // Use the folder at index 1 as the book (immediate subfolder of root)
                const folderName = pathParts[1];
                const { bookTitle } = parseBookFolderName(folderName);
                const parsed = parseImportFilename(filename);

                if (!bookNotes[bookTitle]) {
                    bookNotes[bookTitle] = [];
                }
                bookNotes[bookTitle].push({
                    order: parsed.order || bookNotes[bookTitle].length,
                    noteTitle: parsed.noteTitle,
                    content,
                    type: fileType
                });
            } else {
                // File is at root level -> standalone note
                const parsed = parseImportFilename(filename);
                standaloneNotes.push({
                    noteTitle: parsed.noteTitle,
                    content,
                    type: fileType
                });
            }
        }

        if (Object.keys(bookNotes).length === 0 && standaloneNotes.length === 0) {
            return res.status(400).json({ error: 'No valid files (.md, .excalidraw or .drawio) found' });
        }

        // Create books and notes
        const createdBooks = [];
        const createdNotes = [];

        // Create books
        for (const bookTitle of Object.keys(bookNotes)) {
            let bookId = generateId();
            let retry = 0;
            let book = null;

            while (retry < 5) {
                try {
                    book = await db.Book.create({
                        id: bookId,
                        title: bookTitle,
                        ownerId: userId
                    });
                    break;
                } catch (e) {
                    if (e.name === 'SequelizeUniqueConstraintError') {
                        bookId = generateId();
                        retry++;
                    } else {
                        throw e;
                    }
                }
            }

            if (!book) {
                console.error(`Failed to create book: ${bookTitle}`);
                continue;
            }

            createdBooks.push({ id: book.id, title: book.title });

            const notesToCreate = bookNotes[bookTitle].sort((a, b) => a.order - b.order);

            for (let i = 0; i < notesToCreate.length; i++) {
                const noteData = notesToCreate[i];
                let noteId = generateId();
                retry = 0;

                while (retry < 5) {
                    try {
                        const isWhiteboard = noteData.type === 'excalidraw';
                        const isDrawio = noteData.type === 'drawio';
                        let diagramData = null;
                        let noteContent = noteData.content;
                        let tags = [];

                        if (isWhiteboard) {
                            try {
                                // Ensure content is JSON string
                                let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                                // Verify it's valid JSON
                                JSON.parse(contentStr);
                                noteContent = contentStr;
                            } catch (e) {
                                console.error('Invalid content for whiteboard note', e);
                                noteContent = JSON.stringify({ elements: [], appState: {}, files: {} });
                            }
                        } else if (isDrawio) {
                            // Check for JSON or XML
                            let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                            if (contentStr.trim().startsWith('{')) {
                                try {
                                    JSON.parse(contentStr);
                                    noteContent = contentStr;
                                } catch (e) {
                                    // Not valid JSON, treat as XML
                                    noteContent = JSON.stringify({ xml: contentStr });
                                }
                            } else {
                                noteContent = JSON.stringify({ xml: contentStr });
                            }
                        } else {
                            tags = parseTags(noteData.content);
                        }

                        const note = await db.Note.create({
                            id: noteId,
                            title: noteData.noteTitle,
                            content: noteContent,
                            noteType: isWhiteboard ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown'),
                            tags: tags,
                            bookId: book.id,
                            order: i,
                            ownerId: userId,
                            shareId: generateShareId()
                        });
                        createdNotes.push({ id: note.id, title: note.title, bookId: book.id });
                        break;
                    } catch (e) {
                        if (e.name === 'SequelizeUniqueConstraintError') {
                            noteId = generateId();
                            retry++;
                        } else {
                            throw e;
                        }
                    }
                }
            }
        }

        // Create standalone notes
        for (const noteData of standaloneNotes) {
            let noteId = generateId();
            let retry = 0;

            while (retry < 5) {
                try {
                    const isWhiteboard = noteData.type === 'excalidraw';
                    const isDrawio = noteData.type === 'drawio';
                    let diagramData = null;
                    let noteContent = noteData.content;
                    let tags = [];

                    if (isWhiteboard) {
                        try {
                            // Ensure content is JSON string
                            let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                            // Verify it's valid JSON
                            JSON.parse(contentStr);
                            noteContent = contentStr;
                        } catch (e) {
                            console.error('Failed to parse excalidraw content', e);
                            noteContent = JSON.stringify({ elements: [], appState: {}, files: {} });
                        }
                    } else if (isDrawio) {
                        let contentStr = typeof noteData.content === 'string' ? noteData.content : JSON.stringify(noteData.content);
                        if (contentStr.trim().startsWith('{')) {
                            try {
                                JSON.parse(contentStr);
                                noteContent = contentStr;
                            } catch (e) {
                                noteContent = JSON.stringify({ xml: contentStr });
                            }
                        } else {
                            noteContent = JSON.stringify({ xml: contentStr });
                        }
                    } else {
                        tags = parseTags(noteData.content);
                    }

                    const note = await db.Note.create({
                        id: noteId,
                        title: noteData.noteTitle,
                        content: noteContent,
                        noteType: isWhiteboard ? 'excalidraw' : (isDrawio ? 'drawio' : 'markdown'),
                        tags: tags,
                        ownerId: userId,
                        shareId: generateShareId()
                    });
                    createdNotes.push({ id: note.id, title: note.title });
                    break;
                } catch (e) {
                    if (e.name === 'SequelizeUniqueConstraintError') {
                        noteId = generateId();
                        retry++;
                    } else {
                        throw e;
                    }
                }
            }
        }

        res.json({
            success: true,
            stats: {
                books: createdBooks.length,
                notes: createdNotes.length
            },
            created: {
                books: createdBooks,
                notes: createdNotes
            }
        });

    } catch (e) {
        console.error('Import folder error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
