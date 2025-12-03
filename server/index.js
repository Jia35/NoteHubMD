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
db.sequelize.sync({ force: false }).then(() => {
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});

// Socket.io
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('join-note', (noteId) => {
        socket.join(noteId);
    });

    socket.on('edit-note', (data) => {
        // Broadcast changes to other clients in the same room
        socket.to(data.noteId).emit('note-updated', data.content);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});
