/**
 * Socket.io Composable
 */
import { io } from 'socket.io-client'
import { ref, onUnmounted } from 'vue'

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
        s.on('note-updated', callback)
    }

    const offNoteUpdated = (callback) => {
        s.off('note-updated', callback)
    }

    const onUsersInNote = (callback) => {
        s.on('users-in-note', (users) => {
            usersInNote.value = users
            if (callback) callback(users)
        })
    }

    const offUsersInNote = (callback) => {
        s.off('users-in-note', callback)
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
