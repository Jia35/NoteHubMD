const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const db = require('./models');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/_uploads', express.static(path.join(__dirname, '../_uploads')));
app.use(session({
    secret: 'notehubmd-secret',
    resave: false,
    saveUninitialized: false
}));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

// Serve index.html for all non-api routes (SPA support)
// Using regex for catch-all in Express 5
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Sync DB and start server
// Using alter: true to automatically add new columns (like lastEditorId)
db.sequelize.sync({ alter: true }).then(() => {
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});

// Track online users per note room
// Map<noteId, Map<socketId, { username, joinedAt }>>
const noteUsersMap = new Map();

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
    console.log('New client connected:', socket.id);

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
            joinedAt: new Date().toISOString()
        });

        // Broadcast updated user list
        broadcastUsersInNote(noteId);
        console.log(`User ${username} joined note ${noteId}`);
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
            console.log(`Socket ${socket.id} left note ${noteId}`);
        }
    });

    socket.on('edit-note', (data) => {
        // Broadcast changes to other clients in the same room
        socket.to(data.noteId).emit('note-updated', data.content);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

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
