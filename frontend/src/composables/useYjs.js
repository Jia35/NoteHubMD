/**
 * useYjs - Yjs CRDT composable for whiteboard real-time collaboration
 * Provides conflict-free synchronization and cursor awareness
 * 
 * Uses Y.Map to store scene as JSON string for simpler sync
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ref } from 'vue'

export function useYjs(noteId, username) {
    const connected = ref(false)
    const synced = ref(false)
    const remoteCursors = ref(new Map())

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
        console.log('[useYjs] Sync event:', isSynced)
        synced.value = isSynced
    })

    // Fallback: set synced after connection established
    provider.once('status', ({ status }) => {
        if (status === 'connected') {
            setTimeout(() => {
                if (!synced.value) {
                    console.log('[useYjs] Fallback sync after 500ms')
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

    // Listen to awareness changes from other users
    awareness.on('change', () => {
        const states = awareness.getStates()
        const cursors = new Map()

        states.forEach((state, clientId) => {
            if (clientId !== ydoc.clientID && state.cursor) {
                cursors.set(clientId, {
                    x: state.cursor.x,
                    y: state.cursor.y,
                    username: state.user?.name || 'Guest',
                    color: state.user?.color || '#666'
                })
            }
        })

        remoteCursors.value = cursors
    })

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
        console.log('[useYjs] setElements:', elements.length, 'elements')
    }

    // Listen for remote changes
    let remoteChangeCallback = null
    const onRemoteChange = (callback) => {
        remoteChangeCallback = callback
        yScene.observe((event, transaction) => {
            // Only trigger on remote changes (not local transactions)
            if (!transaction.local && remoteChangeCallback) {
                const elements = getElements()
                console.log('[useYjs] Remote scene change:', elements.length, 'elements')
                // Update hash to prevent echo
                const hash = simpleHash(JSON.stringify(elements))
                lastElementsHash = hash
                remoteChangeCallback(elements)
            }
        })
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
