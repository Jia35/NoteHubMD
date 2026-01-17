/**
 * useYjsDrawio - Yjs composable for Draw.io real-time collaboration
 * 
 * Syncs XML content via Yjs Y.Map.
 * Note: Cursor sharing is NOT supported due to Draw.io iframe limitations.
 */
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ref } from 'vue'

export function useYjsDrawio(noteId, username) {
    const connected = ref(false)
    const synced = ref(false)

    // Create Y.Doc
    const ydoc = new Y.Doc()

    // Use Y.Map to store diagram data
    const yDiagram = ydoc.getMap('diagram')

    // WebSocket Provider - connect to /whiteboard/{noteId}
    // (reusing existing Yjs endpoint)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${wsProtocol}//${window.location.host}/whiteboard/${noteId}`

    const provider = new WebsocketProvider(wsUrl, noteId, ydoc, {
        connect: true
    })

    // Connection status listeners
    provider.on('status', ({ status }) => {
        connected.value = status === 'connected'
    })

    provider.on('sync', (isSynced) => {
        synced.value = isSynced
    })

    // Fallback: set synced after connection established
    provider.once('status', ({ status }) => {
        if (status === 'connected') {
            setTimeout(() => {
                if (!synced.value) {
                    synced.value = true
                }
            }, 500)
        }
    })

    // ===== Data Sync Methods =====

    // Get current XML
    const getXml = () => {
        return yDiagram.get('xml') || null
    }

    // Set XML (local changes)
    let lastXmlHash = ''
    const setXml = (xml) => {
        if (!xml) return

        // Only update if actually changed
        const hash = simpleHash(xml)
        if (hash === lastXmlHash) {
            return false // No change
        }

        lastXmlHash = hash
        yDiagram.set('xml', xml)
        return true
    }

    // Listen for remote changes
    let remoteChangeCallback = null
    const onRemoteChange = (callback) => {
        remoteChangeCallback = callback
        yDiagram.observe((event, transaction) => {
            // Only trigger on remote changes (not local)
            if (!transaction.local && remoteChangeCallback) {
                const xml = getXml()
                if (xml) {
                    // Update hash to prevent echo
                    lastXmlHash = simpleHash(xml)
                    remoteChangeCallback(xml)
                }
            }
        })
    }

    // Cleanup
    const destroy = () => {
        provider.disconnect()
        provider.destroy()
        ydoc.destroy()
    }

    return {
        ydoc,
        yDiagram,
        provider,
        connected,
        synced,
        getXml,
        setXml,
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

export default useYjsDrawio
