/**
 * API Helper Composable
 */

const api = {
    async login(username, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Login failed')
        }
        return res.json()
    },

    async register(username, password) {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Registration failed')
        }
        return res.json()
    },

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' })
    },

    async getMe() {
        const res = await fetch('/api/auth/me')
        if (!res.ok) throw new Error('Not authenticated')
        return res.json()
    },

    async updateProfile(data) {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        if (!res.ok) {
            const result = await res.json()
            throw new Error(result.error || 'Failed to update profile')
        }
        return res.json()
    },

    async uploadAvatar(file) {
        const formData = new FormData()
        formData.append('avatar', file)
        const res = await fetch('/api/upload/avatar', {
            method: 'POST',
            body: formData
        })
        if (!res.ok) {
            const result = await res.json()
            throw new Error(result.error || 'Failed to upload avatar')
        }
        return res.json()
    },

    async uploadImage(file) {
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch('/api/upload/image', {
            method: 'POST',
            body: formData
        })
        if (!res.ok) {
            const result = await res.json()
            throw new Error(result.error || 'Failed to upload image')
        }
        return res.json()
    },

    async createNote() {
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        })
        return res.json()
    },

    async createWhiteboard(title = 'Untitled Whiteboard') {
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                noteType: 'excalidraw'
            })
        })
        return res.json()
    },

    async createFlowchart(title = 'Untitled Flowchart') {
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                noteType: 'drawio'
            })
        })
        return res.json()
    },

    async getNote(id) {
        const res = await fetch('/api/notes/' + id)
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Note not found')
        }
        return res.json()
    },

    async updateNote(id, data) {
        const res = await fetch('/api/notes/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        return res.json()
    },

    async createBook(data = {}) {
        const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        return res.json()
    },

    async getBook(id) {
        const res = await fetch('/api/books/' + id)
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Book not found')
        }
        return res.json()
    },

    async updateBook(id, data) {
        const res = await fetch('/api/books/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        return res.json()
    },

    async createNoteInBook(bookId, type = 'markdown') {
        const body = { noteType: type }
        // Set default title for diagram types
        if (type === 'excalidraw') {
            body.title = 'Untitled Whiteboard'
        }
        if (type === 'drawio') {
            body.title = 'Untitled Flowchart'
        }

        const res = await fetch(`/api/books/${bookId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        return res.json()
    },

    async getNotes(options = {}) {
        const params = new URLSearchParams(options)
        const res = await fetch('/api/notes?' + params.toString())
        return res.json()
    },

    async getAllNotesForTags() {
        const res = await fetch('/api/notes?includeBookNotes=true')
        return res.json()
    },

    async getBooks() {
        const res = await fetch('/api/books')
        return res.json()
    },

    async reorderBookNotes(bookId, noteIds) {
        const res = await fetch(`/api/books/${bookId}/notes/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteIds })
        })
        if (!res.ok) throw new Error('Reorder failed')
        return res.json()
    },

    async updateBookPermission(id, permission) {
        const res = await fetch('/api/books/' + id + '/permission', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permission })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to update book permission')
        }
        return res.json()
    },

    // User search for permission assignment
    async searchUsers(query) {
        const res = await fetch('/api/users/search?q=' + encodeURIComponent(query))
        return res.json()
    },

    // Note user permissions
    async getNoteUserPermissions(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/user-permissions')
        if (!res.ok) throw new Error('Failed to load user permissions')
        return res.json()
    },

    async addNoteUserPermission(noteId, targetUserId, permission) {
        const res = await fetch('/api/notes/' + noteId + '/user-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, permission })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to add user permission')
        }
        return res.json()
    },

    async removeNoteUserPermission(noteId, targetUserId) {
        const res = await fetch('/api/notes/' + noteId + '/user-permissions/' + targetUserId, {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to remove user permission')
        return res.json()
    },

    // Book user permissions
    async getBookUserPermissions(bookId) {
        const res = await fetch('/api/books/' + bookId + '/user-permissions')
        if (!res.ok) throw new Error('Failed to load user permissions')
        return res.json()
    },

    async addBookUserPermission(bookId, targetUserId, permission) {
        const res = await fetch('/api/books/' + bookId + '/user-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, permission })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to add user permission')
        }
        return res.json()
    },

    async removeBookUserPermission(bookId, targetUserId) {
        const res = await fetch('/api/books/' + bookId + '/user-permissions/' + targetUserId, {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to remove user permission')
        return res.json()
    },

    // Trash operations - Notes
    async deleteNote(id) {
        const res = await fetch('/api/notes/' + id, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete note')
        return res.json()
    },

    async restoreNote(id) {
        const res = await fetch('/api/notes/' + id + '/restore', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to restore note')
        return res.json()
    },

    async forceDeleteNote(id) {
        const res = await fetch('/api/notes/' + id + '/force', { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to permanently delete note')
        return res.json()
    },

    // Trash operations - Books
    async deleteBook(id) {
        const res = await fetch('/api/books/' + id, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete book')
        return res.json()
    },

    async restoreBook(id) {
        const res = await fetch('/api/books/' + id + '/restore', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to restore book')
        return res.json()
    },

    async forceDeleteBook(id) {
        const res = await fetch('/api/books/' + id + '/force', { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to permanently delete book')
        return res.json()
    },

    // Get Trash
    async getTrash() {
        const res = await fetch('/api/trash')
        if (!res.ok) throw new Error('Failed to get trash')
        return res.json()
    },

    // Pinned items
    async getPinnedItems() {
        const res = await fetch('/api/auth/pins')
        if (!res.ok) throw new Error('Failed to get pinned items')
        return res.json()
    },

    async addPin(type, id) {
        const res = await fetch('/api/auth/pins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, id })
        })
        if (!res.ok) throw new Error('Failed to add pin')
        return res.json()
    },

    async removePin(type, id) {
        const res = await fetch('/api/auth/pins/' + type + '/' + id, {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to remove pin')
        return res.json()
    },

    // Note revisions
    async getNoteRevisions(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/revisions')
        if (!res.ok) throw new Error('Failed to get revisions')
        return res.json()
    },

    async getRevision(noteId, revisionId) {
        const res = await fetch('/api/notes/' + noteId + '/revisions/' + revisionId)
        if (!res.ok) throw new Error('Failed to get revision')
        return res.json()
    },

    async saveRevision(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/revisions', {
            method: 'POST'
        })
        if (!res.ok) throw new Error('Failed to save revision')
        return res.json()
    },

    async restoreRevision(noteId, revisionId) {
        const res = await fetch('/api/notes/' + noteId + '/revisions/' + revisionId + '/restore', {
            method: 'POST'
        })
        if (!res.ok) throw new Error('Failed to restore revision')
        return res.json()
    },

    // Share link
    async generateShareId(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/share', {
            method: 'POST'
        })
        if (!res.ok) throw new Error('Failed to generate share ID')
        return res.json()
    },

    async resetShareId(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/reset-share', {
            method: 'POST'
        })
        if (!res.ok) throw new Error('Failed to reset share ID')
        return res.json()
    },

    async setShareAlias(noteId, alias) {
        const res = await fetch('/api/notes/' + noteId + '/alias', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to set alias')
        }
        return res.json()
    },

    async clearShareAlias(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/alias', {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to clear alias')
        return res.json()
    },

    // Book Share Alias
    async setBookShareAlias(bookId, alias) {
        const res = await fetch('/api/books/' + bookId + '/alias', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias })
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to set alias')
        }
        return res.json()
    },

    async clearBookShareAlias(bookId) {
        const res = await fetch('/api/books/' + bookId + '/alias', {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to clear alias')
        return res.json()
    },

    // Book Share Link
    async generateBookShareId(bookId) {
        const res = await fetch('/api/books/' + bookId + '/share', {
            method: 'POST'
        })
        if (!res.ok) throw new Error('Failed to generate share ID')
        return res.json()
    },

    async resetBookShareId(bookId) {
        const res = await fetch('/api/books/' + bookId + '/share', {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to reset share ID')
        return res.json()
    },

    // Get shared note
    async getSharedNote(shareId) {
        const res = await fetch('/api/share/' + shareId)
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Note not found')
        }
        return res.json()
    },

    // Get shared book
    async getSharedBook(shareId) {
        const res = await fetch('/api/book-share/' + shareId)
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Book not found')
        }
        return res.json()
    },

    // Comments
    async getComments(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/comments')
        if (!res.ok) throw new Error('Failed to get comments')
        return res.json()
    },

    async addComment(noteId, content, parentId = null) {
        const res = await fetch('/api/notes/' + noteId + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, parentId })
        })
        if (!res.ok) throw new Error('Failed to add comment')
        return res.json()
    },

    async deleteComment(noteId, commentId) {
        const res = await fetch('/api/comments/' + commentId, {
            method: 'DELETE'
        })
        if (!res.ok) throw new Error('Failed to delete comment')
        return res.json()
    },

    async updateComment(noteId, commentId, data) {
        const res = await fetch('/api/comments/' + commentId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        if (!res.ok) throw new Error('Failed to update comment')
        return res.json()
    },

    // Comment reactions
    async toggleCommentReaction(commentId, type) {
        const res = await fetch('/api/comments/' + commentId + '/reactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        })
        if (!res.ok) throw new Error('Failed to toggle reaction')
        return res.json()
    },

    // App version
    async getAppVersion() {
        const res = await fetch('/api/version')
        if (!res.ok) return { version: '' }
        return res.json()
    },

    // System articles
    async getSystemArticles() {
        const res = await fetch('/api/system/articles')
        if (!res.ok) return { book: null, notes: [] }
        return res.json()
    },

    async getSystemArticle(id) {
        const res = await fetch('/api/system/articles/' + id)
        if (!res.ok) throw new Error('System article not found')
        return res.json()
    },

    // Note reactions
    async getNoteReactions(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/reactions')
        if (!res.ok) {
            // Return empty if feature disabled or error
            return { reactionCounts: {}, userReaction: null }
        }
        return res.json()
    },

    async toggleNoteReaction(noteId, type) {
        const res = await fetch('/api/notes/' + noteId + '/reactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        })
        if (!res.ok) throw new Error('Failed to toggle reaction')
        return res.json()
    },

    // Feature config
    async getFeatureConfig() {
        const res = await fetch('/api/config/features')
        if (!res.ok) {
            return { comments: true, noteReactions: true }
        }
        return res.json()
    },

    // AI Assistant settings
    async getAiSettings() {
        const res = await fetch('/api/ai/settings')
        if (!res.ok) {
            return { enabled: false }
        }
        return res.json()
    },

    async updateAiSettings(settings) {
        const res = await fetch('/api/ai/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        })
        if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Failed to update AI settings')
        }
        return res.json()
    },

    async testAiConnection(settings) {
        const res = await fetch('/api/ai/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Connection test failed')
        }
        return data
    },

    async getAiModels() {
        const res = await fetch('/api/ai/models')
        if (!res.ok) {
            return { models: [] }
        }
        return res.json()
    }
}

export function useApi() {
    return api
}

export default api
