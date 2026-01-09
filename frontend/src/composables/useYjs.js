/**
 * useYjs - Yjs CRDT composable for whiteboard real-time collaboration
 * Provides conflict-free synchronization and cursor awareness
 * 
 * Uses Y.Map to store scene as JSON string for simpler sync
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ref, shallowRef, triggerRef } from 'vue'

export function useYjs(noteId, username) {
    const connected = ref(false)
    const synced = ref(false)
    // Use shallowRef for the Map to ensure reactivity when replaced
    const remoteCursors = shallowRef(new Map())

    // Create Y.Doc
    const ydoc = new Y.Doc()

    // Use Y.Map to store scene data as JSON string
    const yScene = ydoc.getMap('scene')

    // WebSocket Provider - connect to /whiteboard/{noteId}
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/whiteboard/${noteId}`

    const provider = new WebsocketProvider(wsUrl, noteId, ydoc, {
        connect: true
    })

    // Connection status listeners
    provider.on('status', ({ status }) => {
        connected.value = status === 'connected'
        console.log('[useYjs] Status:', status)
    })

    // Use synced property or fallback to connected
    provider.on('sync', (isSynced) => {
        // console.log('[useYjs] Sync event:', isSynced)
        synced.value = isSynced
    })

    // Fallback: set synced after connection established
    provider.once('status', ({ status }) => {
        if (status === 'connected') {
            setTimeout(() => {
                if (!synced.value) {
                    // console.log('[useYjs] Fallback sync after 500ms')
                    synced.value = true
                }
            }, 500)
        }
    })

    // ===== Awareness API - Cursor Sync =====
    const awareness = provider.awareness

    // Set local user info
    awareness.setLocalStateField('user', {
        name: username,
        color: getRandomColor()
    })

    // Callback for cursor updates
    let cursorsCallback = null
    const onCursorsChange = (callback) => {
        cursorsCallback = callback
    }

    // Track cursor timestamps to detect stale cursors
    const cursorTimestamps = new Map()
    const CURSOR_STALE_TIMEOUT = 5000 // 5 seconds

    // Listen to awareness changes from other users
    awareness.on('change', () => {
        const states = awareness.getStates()
        const cursors = new Map()
        const now = Date.now()

        states.forEach((state, clientId) => {
            if (clientId !== ydoc.clientID && state.cursor) {
                // Update timestamp for this cursor
                cursorTimestamps.set(clientId, now)

                cursors.set(clientId, {
                    x: state.cursor.x,
                    y: state.cursor.y,
                    username: state.user?.name || 'Guest',
                    color: state.user?.color || '#666'
                })
            } else if (clientId !== ydoc.clientID) {
                // Client no longer has cursor, remove timestamp
                cursorTimestamps.delete(clientId)
            }
        })

        remoteCursors.value = cursors
        triggerRef(remoteCursors)

        // Call external callback with array format
        if (cursorsCallback) {
            cursorsCallback(Array.from(cursors.entries()))
        }
    })

    // Periodically clean up stale cursors (every 2 seconds)
    const cleanupInterval = setInterval(() => {
        const now = Date.now()
        let hasChanges = false

        cursorTimestamps.forEach((timestamp, clientId) => {
            if (now - timestamp > CURSOR_STALE_TIMEOUT) {
                cursorTimestamps.delete(clientId)
                remoteCursors.value.delete(clientId)
                hasChanges = true
            }
        })

        if (hasChanges) {
            triggerRef(remoteCursors)
            if (cursorsCallback) {
                cursorsCallback(Array.from(remoteCursors.value.entries()))
            }
        }
    }, 2000)

    // Update local cursor position
    const updateCursor = (x, y) => {
        awareness.setLocalStateField('cursor', { x, y })
    }

    // Clear cursor (when leaving)
    const clearCursor = () => {
        awareness.setLocalStateField('cursor', null)
    }

    // ===== Data Sync Methods =====

    // Get current elements array
    const getElements = () => {
        const elementsJson = yScene.get('elements')
        if (!elementsJson) return []
        try {
            return JSON.parse(elementsJson)
        } catch (e) {
            console.error('[useYjs] Failed to parse elements:', e)
            return []
        }
    }

    // Set elements (initialization or local changes)
    let lastElementsHash = ''
    const setElements = (elements) => {
        // Only update if actually changed (avoid infinite loops)
        const elementsJson = JSON.stringify(elements)
        const hash = simpleHash(elementsJson)

        if (hash === lastElementsHash) {
            return // No change
        }

        lastElementsHash = hash
        yScene.set('elements', elementsJson)
        // console.log('[useYjs] setElements:', elements.length, 'elements')
    }

    // Listen for remote changes
    let remoteChangeCallback = null
    const onRemoteChange = (callback) => {
        remoteChangeCallback = callback
        yScene.observe((event, transaction) => {
            // Only trigger on remote changes (not local transactions)
            if (!transaction.local && remoteChangeCallback) {
                const elements = getElements()
                // console.log('[useYjs] Remote scene change:', elements.length, 'elements')
                // Update hash to prevent echo
                const hash = simpleHash(JSON.stringify(elements))
                lastElementsHash = hash
                remoteChangeCallback(elements)
            }
        })
    }

    // Cleanup
    const destroy = () => {
        clearInterval(cleanupInterval)
        clearCursor()
        provider.disconnect()
        provider.destroy()
        ydoc.destroy()
    }

    return {
        ydoc,
        yScene,
        provider,
        awareness,
        connected,
        synced,
        remoteCursors,
        updateCursor,
        clearCursor,
        getElements,
        setElements,
        onRemoteChange,
        onCursorsChange,
        destroy
    }
}

// Simple hash function for change detection
function simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString()
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

export default useYjs
