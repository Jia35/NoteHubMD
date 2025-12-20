/**
 * NoteHubMD Common - Shared utilities and API helper
 * This file provides common functions used across all pages
 */

// Global namespace
window.NoteHubMD = window.NoteHubMD || {};

// Vue imports (from global Vue)
const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick, getCurrentInstance } = Vue;
const { createRouter, createWebHistory, useRoute } = VueRouter;

// Socket.io
const socket = io();

// Get current user from API (cached)
let currentUserCache = null;
async function getCurrentUser() {
    if (currentUserCache) return currentUserCache;
    try {
        currentUserCache = await api.getMe();
        return currentUserCache;
    } catch (e) {
        return null;
    }
}

// Global Modal State (will be linked to app root after mount)
let appInstance = null;

const globalModal = {
    showAlert: (message, options = {}) => {
        if (appInstance) {
            return appInstance.showAlert(message, options);
        }
        // Fallback to native alert
        alert(message);
        return Promise.resolve(true);
    },
    showConfirm: (message, options = {}) => {
        if (appInstance) {
            return appInstance.showConfirm(message, options);
        }
        // Fallback to native confirm
        return Promise.resolve(confirm(message));
    }
};

// Utils
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Extract tags from markdown content (CodiMD style)
// Supports: ###### tags: `tag1` `tag2` or ###### tags: `tag1`、`tag2`
function extractTags(content) {
    if (!content) return [];
    const match = content.match(/^#{1,6}\s*tags:\s*(.+)$/im);
    if (!match) return [];
    const tagMatches = match[1].match(/`([^`]+)`/g);
    if (!tagMatches) return [];
    return tagMatches.map(t => t.replace(/`/g, '').trim()).filter(Boolean);
}

// Compress image before upload (max 512px for avatar)
// Preserves GIF (for animation) and PNG (for transparency)
async function compressImage(file, maxWidth = 512, maxHeight = 512, quality = 0.8) {
    const isGif = file.type === 'image/gif';
    const isPng = file.type === 'image/png';

    // For GIF: check size only, don't compress (preserves animation)
    if (isGif) {
        if (file.size <= 2 * 1024 * 1024) {
            return file; // Under 2MB, use as-is
        }
        throw new Error('GIF 檔案過大（最大 2MB）。請選擇較小的 GIF 或使用其他圖片格式。');
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Use PNG for transparency, JPEG for others
                const outputType = isPng ? 'image/png' : 'image/jpeg';
                const outputQuality = isPng ? undefined : quality;

                canvas.toBlob((blob) => {
                    if (blob) {
                        const ext = isPng ? '.png' : '.jpg';
                        const baseName = file.name.replace(/\.[^/.]+$/, '') + ext;
                        const compressedFile = new File([blob], baseName, {
                            type: outputType,
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    } else {
                        reject(new Error('Failed to compress image'));
                    }
                }, outputType, outputQuality);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// API Helper
const api = {
    async login(username, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Login failed');
        }
        return res.json();
    },
    async register(username, password) {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Registration failed');
        }
        return res.json();
    },
    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
    },
    async getMe() {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
    },
    async updateProfile(data) {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const result = await res.json();
            throw new Error(result.error || 'Failed to update profile');
        }
        return res.json();
    },
    async uploadAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);
        const res = await fetch('/api/upload/avatar', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) {
            const result = await res.json();
            throw new Error(result.error || 'Failed to upload avatar');
        }
        return res.json();
    },
    async createNote() {
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        return res.json();
    },
    async getNote(id) {
        const res = await fetch('/api/notes/' + id);
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Note not found');
        }
        return res.json();
    },
    async updateNote(id, data) {
        const res = await fetch('/api/notes/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async createBook(data = {}) {
        const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async getBook(id) {
        const res = await fetch('/api/books/' + id);
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Book not found');
        }
        return res.json();
    },
    async updateBook(id, data) {
        const res = await fetch('/api/books/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res.json();
    },
    async createNoteInBook(bookId) {
        const res = await fetch(`/api/books/${bookId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        return res.json();
    },
    async getNotes(options = {}) {
        const params = new URLSearchParams(options);
        const res = await fetch('/api/notes?' + params.toString());
        return res.json();
    },
    async getAllNotesForTags() {
        const res = await fetch('/api/notes?includeBookNotes=true');
        return res.json();
    },
    async getBooks() {
        const res = await fetch('/api/books');
        return res.json();
    },
    async reorderBookNotes(bookId, noteIds) {
        const res = await fetch(`/api/books/${bookId}/notes/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteIds })
        });
        if (!res.ok) throw new Error('Reorder failed');
        return res.json();
    },
    async updatePermission(id, permission) {
        const res = await fetch('/api/notes/' + id + '/permission', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permission })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to update permission');
        }
        return res.json();
    },
    async updateBookPermission(id, permission) {
        const res = await fetch('/api/books/' + id + '/permission', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permission })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to update book permission');
        }
        return res.json();
    },
    // User search for permission assignment
    async searchUsers(query) {
        const res = await fetch('/api/users/search?q=' + encodeURIComponent(query));
        return res.json();
    },
    // Note user permissions
    async getNoteUserPermissions(noteId) {
        const res = await fetch('/api/notes/' + noteId + '/user-permissions');
        if (!res.ok) throw new Error('Failed to load user permissions');
        return res.json();
    },
    async addNoteUserPermission(noteId, targetUserId, permission) {
        const res = await fetch('/api/notes/' + noteId + '/user-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, permission })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to add user permission');
        }
        return res.json();
    },
    async removeNoteUserPermission(noteId, targetUserId) {
        const res = await fetch('/api/notes/' + noteId + '/user-permissions/' + targetUserId, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to remove user permission');
        return res.json();
    },
    // Book user permissions
    async getBookUserPermissions(bookId) {
        const res = await fetch('/api/books/' + bookId + '/user-permissions');
        if (!res.ok) throw new Error('Failed to load user permissions');
        return res.json();
    },
    async addBookUserPermission(bookId, targetUserId, permission) {
        const res = await fetch('/api/books/' + bookId + '/user-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, permission })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to add user permission');
        }
        return res.json();
    },
    async removeBookUserPermission(bookId, targetUserId) {
        const res = await fetch('/api/books/' + bookId + '/user-permissions/' + targetUserId, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to remove user permission');
        return res.json();
    },
    // Trash operations - Notes
    async deleteNote(id) {
        const res = await fetch('/api/notes/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete note');
        return res.json();
    },
    async restoreNote(id) {
        const res = await fetch('/api/notes/' + id + '/restore', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to restore note');
        return res.json();
    },
    async forceDeleteNote(id) {
        const res = await fetch('/api/notes/' + id + '/force', { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to permanently delete note');
        return res.json();
    },
    // Trash operations - Books
    async deleteBook(id) {
        const res = await fetch('/api/books/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete book');
        return res.json();
    },
    async restoreBook(id) {
        const res = await fetch('/api/books/' + id + '/restore', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to restore book');
        return res.json();
    },
    async forceDeleteBook(id) {
        const res = await fetch('/api/books/' + id + '/force', { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to permanently delete book');
        return res.json();
    },
    // Get Trash
    async getTrash() {
        const res = await fetch('/api/trash');
        if (!res.ok) throw new Error('Failed to get trash');
        return res.json();
    },
    // Pinned items
    async getPinnedItems() {
        const res = await fetch('/api/auth/pins');
        if (!res.ok) throw new Error('Failed to get pinned items');
        return res.json();
    },
    async addPin(type, id) {
        const res = await fetch('/api/auth/pins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, id })
        });
        if (!res.ok) throw new Error('Failed to add pin');
        return res.json();
    },
    async removePin(type, id) {
        const res = await fetch('/api/auth/pins/' + type + '/' + id, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Failed to remove pin');
        return res.json();
    }
};

// Function to set app instance (called from page-specific scripts after Vue mount)
function setAppInstance(instance) {
    appInstance = instance;
}

// Export to global namespace
window.NoteHubMD = Object.assign(window.NoteHubMD, {
    // Vue imports
    Vue: { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick, getCurrentInstance },
    VueRouter: { createRouter, createWebHistory, useRoute },
    // Socket
    socket,
    // User
    getCurrentUser,
    // Modal
    globalModal,
    setAppInstance,
    // Utils
    debounce,
    extractTags,
    compressImage,
    // API
    api
});
