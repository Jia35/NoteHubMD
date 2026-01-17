/**
 * useYjsAwareness - Yjs Awareness composable for Markdown real-time cursor sharing
 * 
 * Reuses the existing /whiteboard/ websocket endpoint but only utilizes the Awareness protocol.
 * Does not sync content (as Markdown content is synced via simple Socket.io broadcast for now).
 * 
 * Note: Cursor visibility is controlled by NoteView.vue based on the online users list.
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ref, shallowRef, triggerRef } from 'vue'

export function useYjsAwareness(noteId, username) {
    const connected = ref(false)
    // Use shallowRef for the Map to ensure reactivity when replaced
    const remoteCursors = shallowRef(new Map())

    // Create Y.Doc (dummy doc, we only need it for awareness)
    const ydoc = new Y.Doc()

    // WebSocket Provider - connect to /whiteboard/{noteId}
    // We reuse the existing endpoint even though it's "whiteboard"
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/whiteboard/${noteId}`

    const provider = new WebsocketProvider(wsUrl, noteId, ydoc, {
        connect: true
    })

    // Connection status listeners
    provider.on('status', ({ status }) => {
        connected.value = status === 'connected'
    })

    // ===== Awareness API - Cursor Sync =====
    const awareness = provider.awareness

    // Set local user info with a random color
    const userColor = getRandomColor()

    const setLocalState = () => {
        awareness.setLocalStateField('user', {
            name: username,
            color: userColor
        })
    }
    setLocalState()

    // Callback for cursor updates
    let cursorsCallback = null
    const onCursorsChange = (callback) => {
        cursorsCallback = callback
    }

    // Listen to awareness changes from other users
    awareness.on('change', () => {
        const states = awareness.getStates()
        const cursors = new Map()

        states.forEach((state, clientId) => {
            if (clientId !== ydoc.clientID && state.cursor) {
                cursors.set(clientId, {
                    ...state.cursor,
                    username: state.user?.name || 'Guest',
                    color: state.user?.color || '#666',
                    clientId: clientId
                })
            }
        })

        remoteCursors.value = cursors
        triggerRef(remoteCursors)

        // Call external callback with array format
        if (cursorsCallback) {
            cursorsCallback(Array.from(cursors.entries()))
        }
    })

    // Update local cursor position
    const updateCursor = (cursorData) => {
        awareness.setLocalStateField('cursor', cursorData)
    }

    // Clear cursor (when leaving)
    const clearCursor = () => {
        awareness.setLocalStateField('cursor', null)
    }

    // Cleanup
    const destroy = () => {
        clearCursor()
        provider.disconnect()
        provider.destroy()
        ydoc.destroy()
    }

    return {
        ydoc,
        provider,
        awareness,
        connected,
        remoteCursors,
        updateCursor,
        clearCursor,
        onCursorsChange,
        destroy,
        userColor
    }
}

// Random color generator for cursor colors
function getRandomColor() {
    const colors = [
        '#4A90D9', // Blue
        '#E74C3C', // Red
        '#2ECC71', // Green
        '#F39C12', // Orange
        '#9B59B6', // Purple
        '#1ABC9C', // Teal
        '#E91E63', // Pink
        '#00BCD4'  // Cyan
    ]
    return colors[Math.floor(Math.random() * colors.length)]
}
