/**
 * Yjs WebSocket Server Utility
 * Custom implementation for CommonJS compatibility
 */
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const map = require('lib0/map');

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

// Message types
const messageSync = 0;
const messageAwareness = 1;

// Store docs in memory
const docs = new Map();

/**
 * Get or create a shared document
 */
const getYDoc = (docname) => {
    return map.setIfUndefined(docs, docname, () => {
        const doc = new Y.Doc();
        doc.name = docname;
        doc.conns = new Map();
        doc.awareness = new awarenessProtocol.Awareness(doc);

        doc.awareness.on('update', ({ added, updated, removed }, conn) => {
            const changedClients = added.concat(updated, removed);
            // Broadcast if change originated from a connection OR from the server (e.g. disconnect)
            if (conn !== null) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, messageAwareness);
                encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients));
                const message = encoding.toUint8Array(encoder);
                doc.conns.forEach((_, c) => send(doc, c, message));
            }
        });

        return doc;
    });
};

/**
 * Send message to a connection
 */
const send = (doc, conn, message) => {
    if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
        closeConn(doc, conn);
    }
    try {
        conn.send(message, err => { err != null && closeConn(doc, conn); });
    } catch (e) {
        closeConn(doc, conn);
    }
};

/**
 * Close connection and cleanup
 */
const closeConn = (doc, conn) => {
    if (doc.conns.has(conn)) {
        const controlledIds = doc.conns.get(conn);
        // console.log(`[Yjs] Closing connection. Controlled IDs: ${controlledIds.size}`, Array.from(controlledIds));

        doc.conns.delete(conn);

        // Remove awareness states for this client and notify others
        if (controlledIds.size > 0) {
            const clientIds = Array.from(controlledIds);

            // Use 'server' as origin to trigger the update handler to broadcast the removal
            // This will send an update with null state for these clients
            awarenessProtocol.removeAwarenessStates(doc.awareness, clientIds, 'server');
        }

        if (doc.conns.size === 0) {
            doc.destroy();
            docs.delete(doc.name);
        }
    }
    conn.close();
};

/**
 * Handle incoming message
 */
const messageListener = (conn, doc, message) => {
    try {
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
            case messageSync:
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, messageSync);
                const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, null);

                if (encoding.length(encoder) > 1) {
                    send(doc, conn, encoding.toUint8Array(encoder));
                }

                // If sync step 2, broadcast to other clients
                if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
                    const syncEncoder = encoding.createEncoder();
                    encoding.writeVarUint(syncEncoder, messageSync);
                    syncProtocol.writeSyncStep1(syncEncoder, doc);
                    // Broadcast update to all other connections
                }
                break;

            case messageAwareness:
                const awarenessUpdate = decoding.readVarUint8Array(decoder);
                awarenessProtocol.applyAwarenessUpdate(
                    doc.awareness,
                    awarenessUpdate,
                    conn
                );

                // Track which client IDs this connection controls
                // Extract clientIds from the awareness update
                const awarenessDecoder = decoding.createDecoder(awarenessUpdate);
                const len = decoding.readVarUint(awarenessDecoder);
                const controlledIds = doc.conns.get(conn);
                for (let i = 0; i < len; i++) {
                    const clientId = decoding.readVarUint(awarenessDecoder);
                    controlledIds.add(clientId);
                }
                break;
        }
    } catch (err) {
        console.error('Yjs message error:', err);
        doc.emit('error', [err]);
    }
};

/**
 * Setup WebSocket connection for Yjs
 */
const setupWSConnection = (conn, req, { docName = 'default' } = {}) => {
    conn.binaryType = 'arraybuffer';

    const doc = getYDoc(docName);
    doc.conns.set(conn, new Set());

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    // Send awareness states
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, messageAwareness);
        encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
        send(doc, conn, encoding.toUint8Array(awarenessEncoder));
    }

    conn.on('message', message => messageListener(conn, doc, message));
    conn.on('close', () => closeConn(doc, conn));

    // Handle doc updates and broadcast to all connections
    const updateHandler = (update, origin) => {
        if (origin !== conn) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeUpdate(encoder, update);
            const message = encoding.toUint8Array(encoder);
            doc.conns.forEach((_, c) => send(doc, c, message));
        }
    };
    doc.on('update', updateHandler);

    conn.on('close', () => {
        doc.off('update', updateHandler);
    });
};

module.exports = {
    setupWSConnection,
    getYDoc,
    docs
};
