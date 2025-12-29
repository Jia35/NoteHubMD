/**
 * Socket.io Composable
 */
import { io } from 'socket.io-client'
import { ref } from 'vue'

let socket = null

function getSocket() {
    if (!socket) {
        socket = io()
    }
    return socket
}

export function useSocket() {
    const s = getSocket()
    const usersInNote = ref([])

    // Store wrapped handlers for proper cleanup
    let noteUpdatedHandler = null
    let usersInNoteHandler = null

    const joinNote = (noteId, username = 'Guest') => {
        s.emit('join-note', { noteId, username })
    }

    const leaveNote = (noteId) => {
        s.emit('leave-note', noteId)
    }

    const editNote = (noteId, content) => {
        s.emit('edit-note', { noteId, content })
    }

    const onNoteUpdated = (callback) => {
        // Remove previous handler if exists
        if (noteUpdatedHandler) {
            s.off('note-updated', noteUpdatedHandler)
        }
        noteUpdatedHandler = callback
        s.on('note-updated', noteUpdatedHandler)
    }

    const offNoteUpdated = () => {
        if (noteUpdatedHandler) {
            s.off('note-updated', noteUpdatedHandler)
            noteUpdatedHandler = null
        }
    }

    const onUsersInNote = (callback) => {
        // Remove previous handler if exists
        if (usersInNoteHandler) {
            s.off('users-in-note', usersInNoteHandler)
        }
        usersInNoteHandler = (users) => {
            usersInNote.value = users
            if (callback) callback(users)
        }
        s.on('users-in-note', usersInNoteHandler)
    }

    const offUsersInNote = () => {
        if (usersInNoteHandler) {
            s.off('users-in-note', usersInNoteHandler)
            usersInNoteHandler = null
        }
    }

    return {
        socket: s,
        usersInNote,
        joinNote,
        leaveNote,
        editNote,
        onNoteUpdated,
        offNoteUpdated,
        onUsersInNote,
        offUsersInNote
    }
}

export default useSocket
