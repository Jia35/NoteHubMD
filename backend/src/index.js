const config = require('./config');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const db = require('./models');

// Yjs WebSocket for whiteboard collaboration
const WebSocket = require('ws');
const { setupWSConnection } = require('./utils/yjsServer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Export io for use in other modules
module.exports.io = io;

const PORT = config.server.port;

// Security Headers (Helmet)
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now (can break inline scripts)
    crossOriginEmbedderPolicy: false // Allow embedding resources
}));

// Gzip/Brotli Compression Middleware
app.use(compression());

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Vite SPA configuration
const viteConfig = require('./config/vite');

// Uploads - 1 day cache
app.use('/_uploads', express.static(path.join(__dirname, '../../_uploads'), {
    maxAge: '1d',
    etag: true
}));

app.use(session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false
}));

// API Key Authentication Middleware
const apiKeyAuth = require('./middlewares/apiKeyAuth');
app.use(apiKeyAuth);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api', require('./routes/api'));

// Vite SPA mode - serve static files and handle all routes
const spaHandler = viteConfig.spaMiddleware(app, express);

if (spaHandler) {
    // Login page
    app.get('/login', spaHandler);

    // Note page
    app.get('/n/:id', spaHandler);

    // Note share page
    app.get('/s/:shareId', spaHandler);

    // Book share page
    app.get('/v/:shareId', spaHandler);

    // 404 page
    app.get('/404', spaHandler);

    // All other routes - SPA fallback
    app.get(/(.*)/, spaHandler);
} else {
    // No Vite build available - show error
    app.get(/(.*)/, (req, res) => {
        res.status(500).send('Error: Vite build not found. Please run "cd frontend && npm run build" first.');
    });
}


// System articles initialization
const { initSystemArticles } = require('./utils/systemArticles');

// Trash cleaner
const { cleanExpiredTrash, startScheduledCleanup } = require('./utils/trashCleaner');

// Sync DB and start server
// Using force: false to preserve existing data (columns already exist)
// Using alter: true to add new columns (change back to force: false after columns are added)
db.sequelize.sync({ force: false }).then(async () => {
    // Initialize system articles after DB sync
    await initSystemArticles();

    // Clean expired trash on startup and schedule daily cleanup
    await cleanExpiredTrash();
    startScheduledCleanup();

    // Yjs WebSocket Server for whiteboard collaboration
    const wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url, `http://${request.headers.host}`);

        // Handle Yjs whiteboard collaboration at /whiteboard/{noteId}
        if (url.pathname.startsWith('/whiteboard/')) {
            const docName = url.pathname.replace('/whiteboard/', '');

            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
                setupWSConnection(ws, request, { docName });
            });
        }
        // Other WebSocket connections (Socket.io) are handled automatically by Socket.io
    });

    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Yjs WebSocket handler ready at /whiteboard/{noteId}`);
    });
});

// Track online users per note room
// Map<noteId, Map<socketId, { username, joinedAt }>>
const noteUsersMap = new Map();

// Track all active socket connections (for admin stats)
const activeConnections = new Set();

// Export getter for active connections count
module.exports.getActiveConnectionsCount = () => activeConnections.size;

// Helper: Get users in a note room
function getUsersInNote(noteId) {
    const users = noteUsersMap.get(noteId);
    if (!users) return [];
    return Array.from(users.values());
}

// Helper: Broadcast users list to all clients in a note room
function broadcastUsersInNote(noteId) {
    const users = getUsersInNote(noteId);
    io.to(noteId).emit('users-in-note', users);
}

// Socket.io
io.on('connection', (socket) => {
    // Add to active connections tracking
    activeConnections.add(socket.id);

    // Track which notes this socket has joined
    socket.noteRooms = new Set();

    socket.on('join-note', (data) => {
        // Support both old format (string) and new format ({ noteId, username })
        const noteId = typeof data === 'string' ? data : data.noteId;
        const username = typeof data === 'string' ? 'Guest' : (data.username || 'Guest');

        socket.join(noteId);
        socket.noteRooms.add(noteId);

        // Add user to tracking
        if (!noteUsersMap.has(noteId)) {
            noteUsersMap.set(noteId, new Map());
        }
        noteUsersMap.get(noteId).set(socket.id, {
            username,
            name: typeof data === 'object' ? (data.name || null) : null,
            joinedAt: new Date().toISOString()
        });

        // Broadcast updated user list
        broadcastUsersInNote(noteId);
        // console.log(`User ${username} joined note ${noteId}`);
    });

    socket.on('leave-note', (noteId) => {
        if (socket.noteRooms.has(noteId)) {
            socket.leave(noteId);
            socket.noteRooms.delete(noteId);

            // Remove user from tracking
            const users = noteUsersMap.get(noteId);
            if (users) {
                users.delete(socket.id);
                if (users.size === 0) {
                    noteUsersMap.delete(noteId);
                } else {
                    broadcastUsersInNote(noteId);
                }
            }
            // console.log(`Socket ${socket.id} left note ${noteId}`);
        }
    });

    socket.on('edit-note', (data) => {
        // Broadcast changes to other clients in the same room
        socket.to(data.noteId).emit('note-updated', data.content);
    });

    socket.on('disconnect', () => {
        // Remove from active connections tracking
        activeConnections.delete(socket.id);

        // Remove user from all note rooms they were in
        for (const noteId of socket.noteRooms) {
            const users = noteUsersMap.get(noteId);
            if (users) {
                users.delete(socket.id);
                if (users.size === 0) {
                    noteUsersMap.delete(noteId);
                } else {
                    broadcastUsersInNote(noteId);
                }
            }
        }
    });
});
