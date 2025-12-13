const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick, getCurrentInstance } = Vue;
const { createRouter, createWebHistory, useRoute } = VueRouter;

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
        globalModal.showAlert(message);
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
    async getNotes() {
        const res = await fetch('/api/notes');
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

// --- Components ---

const Login = {
    template: '#login-template',
    setup() {
        const router = VueRouter.useRouter();
        const route = useRoute();
        const isRegister = ref(false);
        const username = ref('');
        const password = ref('');
        const error = ref('');

        const toggleMode = () => {
            isRegister.value = !isRegister.value;
            error.value = '';
        };

        const handleSubmit = async () => {
            error.value = '';
            try {
                if (isRegister.value) {
                    await api.register(username.value, password.value);
                } else {
                    await api.login(username.value, password.value);
                }
                // Redirect to original page if available, otherwise home
                const redirectTo = route.query.redirect || '/';
                window.location.href = redirectTo;
            } catch (e) {
                error.value = e.message;
            }
        };

        return { isRegister, username, password, error, toggleMode, handleSubmit };
    }
};

const Sidebar = {
    template: '#sidebar-template',
    props: ['user'],
    setup(props) {
        const showSettings = ref(false);
        const theme = ref(localStorage.getItem('NoteHubMD-theme') || 'dark');

        // User Profile Modal
        const showUserProfileModal = ref(false);
        const editableName = ref('');
        const avatarPreview = ref('');
        const avatarFile = ref(null);
        const savingProfile = ref(false);
        const avatarRemoved = ref(false);

        // Pinned items
        const pinnedItems = ref([]);

        // App version
        const appVersion = ref('');

        const loadPinnedItems = async () => {
            try {
                const data = await api.getPinnedItems();
                pinnedItems.value = data;
            } catch (e) {
                console.error('[Sidebar] Failed to load pinned items:', e);
            }
        };

        const loadAppVersion = async () => {
            try {
                const response = await fetch('/api/version');
                const data = await response.json();
                appVersion.value = data.version || '';
            } catch (e) {
                console.error('[Sidebar] Failed to load version:', e);
            }
        };

        const unpinItem = async (type, id) => {
            try {
                await api.removePin(type, id);
                pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id));
            } catch (e) {
                globalModal.showAlert('取消釘選失敗');
            }
        };

        const openUserProfileModal = () => {
            if (!props.user) return;
            editableName.value = props.user.name || '';
            avatarPreview.value = props.user.avatar || '';
            avatarFile.value = null;
            avatarRemoved.value = false;
            showUserProfileModal.value = true;
        };

        const handleAvatarChange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                // Compress image before storing
                const compressedFile = await compressImage(file);
                avatarFile.value = compressedFile;
                avatarRemoved.value = false;

                // Preview compressed image
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.value = e.target.result;
                };
                reader.readAsDataURL(compressedFile);
            } catch (e) {
                globalModal.showAlert('圖片處理失敗：' + e.message);
            }
        };

        const removeAvatar = () => {
            avatarPreview.value = '';
            avatarFile.value = null;
            avatarRemoved.value = true;
        };

        const saveProfile = async () => {
            savingProfile.value = true;
            try {
                let avatarUrl = props.user.avatar;

                if (avatarRemoved.value) {
                    avatarUrl = null;
                } else if (avatarFile.value) {
                    const uploadResult = await api.uploadAvatar(avatarFile.value);
                    avatarUrl = uploadResult.url;
                }

                const result = await api.updateProfile({
                    name: editableName.value,
                    avatar: avatarUrl
                });

                if (props.user) {
                    props.user.name = result.name;
                    props.user.avatar = result.avatar;
                }

                currentUserCache = null;
                avatarRemoved.value = false;
                showUserProfileModal.value = false;
            } catch (e) {
                globalModal.showAlert('儲存失敗：' + e.message);
            } finally {
                savingProfile.value = false;
            }
        };

        const setTheme = (t) => {
            theme.value = t;
            localStorage.setItem('NoteHubMD-theme', t);
            updateThemeClass(t);
        };

        const updateThemeClass = (t) => {
            if (t === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        const logout = async () => {
            await api.logout();
            window.location.href = '/login';
        };

        // Create Note function
        const createNote = async () => {
            try {
                const note = await api.createNote();
                window.location.href = '/note/' + note.id;
            } catch (e) { globalModal.showAlert('Error creating note'); }
        };

        // Create Book Modal state and functions
        const showCreateBookModal = ref(false);
        const newBookTitle = ref('');
        const newBookDescription = ref('');

        const openCreateBookModal = () => {
            newBookTitle.value = '';
            newBookDescription.value = '';
            showCreateBookModal.value = true;
        };

        const createBook = async () => {
            if (!newBookTitle.value.trim()) {
                globalModal.showAlert('請輸入書本標題');
                return;
            }
            try {
                const book = await api.createBook({
                    title: newBookTitle.value.trim(),
                    description: newBookDescription.value.trim()
                });
                showCreateBookModal.value = false;
                window.location.href = '/book/' + book.id;
            } catch (e) { globalModal.showAlert('Error creating book'); }
        };

        onMounted(() => {
            updateThemeClass(theme.value);
            loadPinnedItems();
            loadAppVersion();
            // Listen for pin updates from other components
            window.addEventListener('pins-updated', loadPinnedItems);
        });

        onUnmounted(() => {
            window.removeEventListener('pins-updated', loadPinnedItems);
        });

        return {
            showSettings, theme, setTheme, logout,
            createNote,
            showCreateBookModal, newBookTitle, newBookDescription,
            openCreateBookModal, createBook,
            // Profile modal
            showUserProfileModal, editableName, avatarPreview,
            openUserProfileModal, handleAvatarChange, removeAvatar, saveProfile, savingProfile,
            // Pinned items
            pinnedItems, unpinItem,
            // App version
            appVersion
        };
    }
};

const Layout = {
    template: '#layout-template',
    components: { Sidebar },
    setup() {
        const user = ref(null);
        const router = VueRouter.useRouter();
        const route = useRoute();

        onMounted(async () => {
            try {
                user.value = await api.getMe();
            } catch (e) {
                router.push({ path: '/login', query: { redirect: route.fullPath } });
            }
        });

        return { user };
    }
};

const Home = {
    template: '#home-template',
    setup() {
        const router = VueRouter.useRouter();
        const notes = ref([]);
        const books = ref([]);
        const allNotesForTags = ref([]); // All notes including book notes, for tag collection
        const selectedTag = ref('');
        const searchQuery = ref('');
        const includeContent = ref(false);
        const notesViewMode = ref('my'); // 'my' or 'all'
        const sortBy = ref('updatedAt'); // 'updatedAt', 'lastEditedAt', 'createdAt', 'title'
        const sortOrder = ref('desc'); // 'desc' or 'asc'

        // Sort options for UI
        const sortOptions = [
            { value: 'updatedAt', label: '最後更新時間' },
            { value: 'lastEditedAt', label: '最後編輯時間' },
            { value: 'createdAt', label: '建立時間' },
            { value: 'title', label: '標題' }
        ];

        // Sort helper function
        const sortItems = (items) => {
            return [...items].sort((a, b) => {
                let valA, valB;

                if (sortBy.value === 'title') {
                    valA = (a.title || '').toLowerCase();
                    valB = (b.title || '').toLowerCase();
                    const cmp = valA.localeCompare(valB, 'zh-TW');
                    return sortOrder.value === 'asc' ? cmp : -cmp;
                } else {
                    // Date fields
                    valA = a[sortBy.value] ? new Date(a[sortBy.value]).getTime() : 0;
                    valB = b[sortBy.value] ? new Date(b[sortBy.value]).getTime() : 0;
                    return sortOrder.value === 'asc' ? valA - valB : valB - valA;
                }
            });
        };

        // Menu and modal state
        const openMenuId = ref(null);
        const showInfoModal = ref(false);
        const infoModalType = ref(''); // 'book' or 'note'
        const infoModalItem = ref({});
        const editableDescription = ref('');
        const editableTags = ref([]);
        const newTag = ref('');

        // Create Book modal state
        const showCreateBookModal = ref(false);
        const newBookTitle = ref('');
        const newBookDescription = ref('');

        // Pinned items state
        const pinnedItems = ref([]);

        const loadPinnedItems = async () => {
            try {
                pinnedItems.value = await api.getPinnedItems();
            } catch (e) {
                console.error('Failed to load pinned items:', e);
            }
        };

        const isPinned = (type, id) => {
            return pinnedItems.value.some(p => p.type === type && p.id === id);
        };

        const togglePin = async (type, id) => {
            try {
                if (isPinned(type, id)) {
                    await api.removePin(type, id);
                    pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id));
                } else {
                    await api.addPin(type, id);
                    // Reload to get the title
                    await loadPinnedItems();
                }
                openMenuId.value = null;
                // Notify Sidebar to refresh its pinned items
                window.dispatchEvent(new Event('pins-updated'));
            } catch (e) {
                console.error('togglePin error:', e);
                globalModal.showAlert('操作失敗: ' + e.message);
            }
        };

        const loadData = async () => {
            try {
                // Load all data in parallel for better performance
                const [notesData, booksData, allNotesData, pinnedData] = await Promise.all([
                    api.getNotes(),
                    api.getBooks(),
                    api.getAllNotesForTags(),
                    api.getPinnedItems()
                ]);
                notes.value = notesData;
                books.value = booksData;
                allNotesForTags.value = allNotesData;
                pinnedItems.value = pinnedData;
            } catch (e) {
                // Error handling handled by global auth check mostly
            }
        };

        // Collect all unique tags from ALL notes (including book notes) AND books
        const allTags = computed(() => {
            const tagSet = new Set();
            allNotesForTags.value.forEach(note => {
                if (note.tags && Array.isArray(note.tags)) {
                    note.tags.forEach(tag => tagSet.add(tag));
                }
            });
            books.value.forEach(book => {
                if (book.tags && Array.isArray(book.tags)) {
                    book.tags.forEach(tag => tagSet.add(tag));
                }
            });
            return Array.from(tagSet).sort();
        });

        // Helper function to check if an item matches search query
        const matchesSearch = (item, isNote = false) => {
            const query = searchQuery.value.toLowerCase().trim();
            if (!query) return true;

            const titleMatch = (item.title || '').toLowerCase().includes(query);
            const descMatch = (item.description || '').toLowerCase().includes(query);

            if (isNote && includeContent.value) {
                const contentMatch = (item.content || '').toLowerCase().includes(query);
                return titleMatch || descMatch || contentMatch;
            }
            return titleMatch || descMatch;
        };

        // Filter notes by selected tag, search query, and ownership view mode
        // Only show STANDALONE notes (notes inside books will show as their parent book)
        const filteredNotes = computed(() => {
            let result = notes.value;

            // Apply ownership filter (my notes vs all notes)
            if (notesViewMode.value === 'my') {
                result = result.filter(note => note.isOwner);
            }

            // Apply tag filter
            if (selectedTag.value) {
                result = result.filter(note =>
                    note.tags && Array.isArray(note.tags) && note.tags.includes(selectedTag.value)
                );
            }

            // Apply search filter
            if (searchQuery.value.trim()) {
                result = result.filter(note => matchesSearch(note, true));
            }

            // Apply sorting
            return sortItems(result);
        });

        // Filter books by selected tag, search query, and ownership view mode
        // Include books that either: 1) have matching tag, OR 2) contain notes with matching tag
        const filteredBooks = computed(() => {
            let result = books.value;

            // Apply ownership filter (my items vs all items)
            if (notesViewMode.value === 'my') {
                result = result.filter(book => book.isOwner);
            }

            // Apply tag filter
            if (selectedTag.value) {
                // Find book IDs that contain notes with the matching tag
                const bookIdsWithMatchingNotes = new Set();
                allNotesForTags.value.forEach(note => {
                    if (note.bookId && note.tags && Array.isArray(note.tags) && note.tags.includes(selectedTag.value)) {
                        bookIdsWithMatchingNotes.add(note.bookId);
                    }
                });

                result = result.filter(book =>
                    (book.tags && Array.isArray(book.tags) && book.tags.includes(selectedTag.value)) ||
                    bookIdsWithMatchingNotes.has(book.id)
                );
            }

            // Apply search filter
            if (searchQuery.value.trim()) {
                const query = searchQuery.value.toLowerCase().trim();

                // Find book IDs that contain notes matching the search
                const bookIdsWithMatchingNotes = new Set();
                if (includeContent.value) {
                    allNotesForTags.value.forEach(note => {
                        if (note.bookId) {
                            const titleMatch = (note.title || '').toLowerCase().includes(query);
                            const contentMatch = (note.content || '').toLowerCase().includes(query);
                            if (titleMatch || contentMatch) {
                                bookIdsWithMatchingNotes.add(note.bookId);
                            }
                        }
                    });
                }

                result = result.filter(book =>
                    matchesSearch(book, false) || bookIdsWithMatchingNotes.has(book.id)
                );
            }

            // Apply sorting
            return sortItems(result);
        });

        const selectTag = (tag) => {
            selectedTag.value = selectedTag.value === tag ? '' : tag;
        };

        const createNote = async () => {
            try {
                const note = await api.createNote();
                router.push('/note/' + note.id);
            } catch (e) { globalModal.showAlert('Error creating note'); }
        };

        const openCreateBookModal = () => {
            newBookTitle.value = '';
            newBookDescription.value = '';
            showCreateBookModal.value = true;
        };

        const createBook = async () => {
            if (!newBookTitle.value.trim()) {
                globalModal.showAlert('請輸入書本標題');
                return;
            }
            try {
                const book = await api.createBook({
                    title: newBookTitle.value.trim(),
                    description: newBookDescription.value.trim()
                });
                showCreateBookModal.value = false;
                router.push('/book/' + book.id);
            } catch (e) { globalModal.showAlert('Error creating book'); }
        };

        const deleteNote = async (id, event) => {
            event.stopPropagation();
            if (!await globalModal.showConfirm('確定要刪除此筆記？（可從垃圾桶還原）')) return;
            try {
                await api.deleteNote(id);
                notes.value = notes.value.filter(n => n.id !== id);
            } catch (e) { globalModal.showAlert('刪除失敗'); }
        };

        const deleteBook = async (id, event) => {
            event.stopPropagation();
            if (!await globalModal.showConfirm('確定要刪除此書本？（可從垃圾桶還原）')) return;
            try {
                await api.deleteBook(id);
                books.value = books.value.filter(b => b.id !== id);
            } catch (e) { globalModal.showAlert('刪除失敗'); }
        };

        // Menu functions
        const toggleMenu = (type, id) => {
            const menuId = `${type}-${id}`;
            openMenuId.value = openMenuId.value === menuId ? null : menuId;
        };

        // Close menu when clicking outside
        const closeMenu = () => {
            openMenuId.value = null;
        };

        // Info modal functions
        const editablePermission = ref('private');

        const getPermissionLabel = (permission) => {
            const labels = {
                'public-edit': '可編輯',
                'auth-edit': '可編輯 (需登入)',
                'public-view': '唯讀',
                'auth-view': '唯讀 (需登入)',
                'private': '私人',
                'inherit': '繼承書本'
            };
            return labels[permission] || permission;
        };

        const openInfoModal = (type, item) => {
            infoModalType.value = type;
            infoModalItem.value = { ...item };
            editableDescription.value = item.description || '';
            editableTags.value = [...(item.tags || [])];
            editablePermission.value = item.permission || 'private';
            showInfoModal.value = true;
            openMenuId.value = null;
        };

        const addEditableTag = () => {
            const tag = newTag.value.trim();
            if (!tag) return;
            if (editableTags.value.includes(tag)) {
                newTag.value = '';
                return;
            }
            editableTags.value.push(tag);
            newTag.value = '';
        };

        const removeEditableTag = (tagToRemove) => {
            editableTags.value = editableTags.value.filter(t => t !== tagToRemove);
        };

        const saveInfoChanges = async () => {
            try {
                const updateData = { tags: editableTags.value };

                // Save permission change if owner changed it
                if (infoModalItem.value.isOwner && editablePermission.value !== infoModalItem.value.permission) {
                    if (infoModalType.value === 'book') {
                        await api.updateBookPermission(infoModalItem.value.id, editablePermission.value);
                    } else {
                        await api.updatePermission(infoModalItem.value.id, editablePermission.value);
                    }
                }

                if (infoModalType.value === 'book') {
                    updateData.description = editableDescription.value;
                    await api.updateBook(infoModalItem.value.id, updateData);
                    // Update local book data
                    const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id);
                    if (bookIndex !== -1) {
                        books.value[bookIndex].tags = [...editableTags.value];
                        books.value[bookIndex].description = editableDescription.value;
                        books.value[bookIndex].permission = editablePermission.value;
                    }
                } else {
                    await api.updateNote(infoModalItem.value.id, updateData);
                    // Update local note data
                    const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id);
                    if (noteIndex !== -1) {
                        notes.value[noteIndex].tags = [...editableTags.value];
                        notes.value[noteIndex].permission = editablePermission.value;
                    }
                    // Also update in allNotesForTags
                    const allNoteIndex = allNotesForTags.value.findIndex(n => n.id === infoModalItem.value.id);
                    if (allNoteIndex !== -1) {
                        allNotesForTags.value[allNoteIndex].tags = [...editableTags.value];
                    }
                }
                showInfoModal.value = false;
            } catch (e) { globalModal.showAlert('儲存失敗'); }
        };

        // User permissions state for Home info modal
        const infoUserPermissions = ref([]);
        const infoUserSearchQuery = ref('');
        const infoUserSearchResults = ref([]);
        const infoNewUserPermission = ref('edit');
        const infoLoadingUserPermissions = ref(false);

        const loadInfoUserPermissions = async () => {
            if (!infoModalItem.value?.isOwner) return;
            infoLoadingUserPermissions.value = true;
            try {
                if (infoModalType.value === 'note') {
                    infoUserPermissions.value = await api.getNoteUserPermissions(infoModalItem.value.id);
                } else {
                    infoUserPermissions.value = await api.getBookUserPermissions(infoModalItem.value.id);
                }
            } catch (e) {
                console.error('Failed to load user permissions', e);
            } finally {
                infoLoadingUserPermissions.value = false;
            }
        };

        const infoSearchUsers = debounce(async () => {
            if (infoUserSearchQuery.value.length < 2) {
                infoUserSearchResults.value = [];
                return;
            }
            try {
                const results = await api.searchUsers(infoUserSearchQuery.value);
                // Filter out owner and users already in permissions list
                infoUserSearchResults.value = results.filter(u =>
                    u.id !== infoModalItem.value?.owner?.id &&
                    !infoUserPermissions.value.find(p => p.userId === u.id)
                );
            } catch (e) {
                console.error('Failed to search users', e);
            }
        }, 300);

        const addInfoUserPermission = async (user) => {
            try {
                if (infoModalType.value === 'note') {
                    await api.addNoteUserPermission(infoModalItem.value.id, user.id, infoNewUserPermission.value);
                } else {
                    await api.addBookUserPermission(infoModalItem.value.id, user.id, infoNewUserPermission.value);
                }
                await loadInfoUserPermissions();
                infoUserSearchQuery.value = '';
                infoUserSearchResults.value = [];
            } catch (e) {
                globalModal.showAlert('新增失敗：' + e.message);
            }
        };

        const removeInfoUserPermission = async (userId) => {
            try {
                if (infoModalType.value === 'note') {
                    await api.removeNoteUserPermission(infoModalItem.value.id, userId);
                } else {
                    await api.removeBookUserPermission(infoModalItem.value.id, userId);
                }
                infoUserPermissions.value = infoUserPermissions.value.filter(p => p.userId !== userId);
            } catch (e) {
                globalModal.showAlert('移除失敗：' + e.message);
            }
        };

        const updateInfoUserPermissionLevel = async (perm, newLevel) => {
            try {
                if (infoModalType.value === 'note') {
                    await api.addNoteUserPermission(infoModalItem.value.id, perm.userId, newLevel);
                } else {
                    await api.addBookUserPermission(infoModalItem.value.id, perm.userId, newLevel);
                }
                perm.permission = newLevel;
            } catch (e) {
                globalModal.showAlert('更新失敗：' + e.message);
            }
        };

        // Watch for info modal open to load user permissions
        watch(showInfoModal, (val) => {
            if (val) {
                loadInfoUserPermissions();
            } else {
                // Clear state when closed
                infoUserPermissions.value = [];
                infoUserSearchQuery.value = '';
                infoUserSearchResults.value = [];
            }
        });

        onMounted(() => {
            loadData();
            // Close menu when clicking outside
            document.addEventListener('click', closeMenu);
        });

        onUnmounted(() => {
            document.removeEventListener('click', closeMenu);
        });

        return {
            notes, books, createNote, createBook, deleteNote, deleteBook,
            allTags, selectedTag, filteredNotes, filteredBooks, selectTag,
            searchQuery, includeContent, notesViewMode,
            sortBy, sortOrder, sortOptions,
            openMenuId, toggleMenu, closeMenu,
            showInfoModal, infoModalType, infoModalItem,
            editableDescription, editableTags, newTag, editablePermission,
            openInfoModal, addEditableTag, removeEditableTag, saveInfoChanges, getPermissionLabel,
            showCreateBookModal, newBookTitle, newBookDescription, openCreateBookModal,
            // User permissions for info modal
            infoUserPermissions, infoUserSearchQuery, infoUserSearchResults, infoNewUserPermission,
            infoLoadingUserPermissions, infoSearchUsers, addInfoUserPermission,
            removeInfoUserPermission, updateInfoUserPermissionLevel,
            // Pinned items
            pinnedItems, isPinned, togglePin
        };
    }
};

const Book = {
    template: '#book-template',
    setup() {
        const route = useRoute();
        const router = VueRouter.useRouter();
        const book = ref({});
        const newTag = ref('');
        const editableDescription = ref('');
        const editableTags = ref([]);
        const editablePermission = ref('private');
        const notesList = ref(null);
        let sortableInstance = null;

        // Permission state
        const permission = ref('private');
        const isOwner = ref(false);
        const canEdit = ref(false);
        const canAddNote = ref(false);

        // Info modal state
        const showInfoModal = ref(false);

        // User permissions state for info modal
        const infoUserPermissions = ref([]);
        const infoUserSearchQuery = ref('');
        const infoUserSearchResults = ref([]);
        const infoNewUserPermission = ref('edit');
        const infoLoadingUserPermissions = ref(false);

        const loadInfoUserPermissions = async () => {
            if (!isOwner.value) return;
            infoLoadingUserPermissions.value = true;
            try {
                infoUserPermissions.value = await api.getBookUserPermissions(book.value.id);
            } catch (e) {
                console.error('Failed to load user permissions', e);
            } finally {
                infoLoadingUserPermissions.value = false;
            }
        };

        const infoSearchUsers = debounce(async () => {
            if (infoUserSearchQuery.value.length < 2) {
                infoUserSearchResults.value = [];
                return;
            }
            try {
                const results = await api.searchUsers(infoUserSearchQuery.value);
                // Filter out owner and users already in permissions list
                infoUserSearchResults.value = results.filter(u =>
                    u.id !== book.value.owner?.id &&
                    !infoUserPermissions.value.find(p => p.userId === u.id)
                );
            } catch (e) {
                console.error('Failed to search users', e);
            }
        }, 300);

        const addInfoUserPermission = async (user) => {
            try {
                await api.addBookUserPermission(book.value.id, user.id, infoNewUserPermission.value);
                await loadInfoUserPermissions();
                infoUserSearchQuery.value = '';
                infoUserSearchResults.value = [];
            } catch (e) {
                globalModal.showAlert('新增失敗：' + e.message);
            }
        };

        const removeInfoUserPermission = async (userId) => {
            try {
                await api.removeBookUserPermission(book.value.id, userId);
                infoUserPermissions.value = infoUserPermissions.value.filter(p => p.userId !== userId);
            } catch (e) {
                globalModal.showAlert('移除失敗：' + e.message);
            }
        };

        const updateInfoUserPermissionLevel = async (perm, newLevel) => {
            try {
                await api.addBookUserPermission(book.value.id, perm.userId, newLevel);
                perm.permission = newLevel;
            } catch (e) {
                globalModal.showAlert('更新失敗：' + e.message);
            }
        };

        // Watch for info modal open to load user permissions
        watch(showInfoModal, (val) => {
            if (val) {
                loadInfoUserPermissions();
            } else {
                // Clear state when closed
                infoUserPermissions.value = [];
                infoUserSearchQuery.value = '';
                infoUserSearchResults.value = [];
            }
        });

        const permissionOptions = [
            { value: 'public-edit', label: '可編輯' },
            { value: 'auth-edit', label: '可編輯 (需登入)' },
            { value: 'public-view', label: '唯讀' },
            { value: 'auth-view', label: '唯讀 (需登入)' },
            { value: 'private', label: '私人' }
        ];

        const initSortable = () => {
            if (sortableInstance) {
                sortableInstance.destroy();
                sortableInstance = null;
            }
            if (!notesList.value || !canEdit.value) return;

            sortableInstance = new Sortable(notesList.value, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: async (evt) => {
                    if (evt.oldIndex === evt.newIndex) return;

                    // Get new order of note IDs
                    const noteIds = Array.from(notesList.value.querySelectorAll('[data-id]'))
                        .map(el => el.dataset.id);

                    try {
                        await api.reorderBookNotes(book.value.id, noteIds);
                    } catch (e) {
                        console.error('Failed to reorder notes', e);
                        globalModal.showAlert('排序失敗');
                        // Reload to restore original order
                        loadBook();
                    }
                }
            });
        };

        const loadBook = async () => {
            try {
                const data = await api.getBook(route.params.id);
                book.value = data;
                if (!book.value.tags) book.value.tags = [];
                permission.value = data.permission || 'private';
                isOwner.value = data.isOwner || false;
                canEdit.value = data.canEdit || false;
                canAddNote.value = data.canAddNote || false;

                // Initialize sortable after data is loaded
                nextTick(() => initSortable());
            } catch (e) {
                console.error('Failed to load book', e);
                // Handle access errors
                if (e.message.includes('Login required')) {
                    globalModal.showAlert('需要登入才能存取此書本');
                    router.push('/login');
                    return;
                } else if (e.message.includes('Access denied')) {
                    globalModal.showAlert('您沒有權限存取此書本');
                    router.push('/');
                    return;
                }
                globalModal.showAlert('Book not found');
                router.push('/');
            }
        };

        const createNote = async () => {
            try {
                const note = await api.createNoteInBook(book.value.id);
                router.push('/note/' + note.id);
            } catch (e) {
                if (e.message.includes('Cannot add notes')) {
                    globalModal.showAlert('您沒有權限在此書本新增筆記');
                } else {
                    globalModal.showAlert('Error creating note');
                }
            }
        };

        const handlePermissionChange = async (newPermission) => {
            try {
                await api.updateBookPermission(book.value.id, newPermission);
                permission.value = newPermission;
            } catch (e) {
                console.error('Failed to update permission', e);
                globalModal.showAlert('無法更新權限：' + e.message);
            }
        };

        // Initialize editable values when opening info modal
        const initInfoModal = () => {
            editableDescription.value = book.value.description || '';
            editableTags.value = [...(book.value.tags || [])];
            editablePermission.value = permission.value;
        };

        const addEditableTag = () => {
            const tag = newTag.value.trim();
            if (!tag) return;
            if (editableTags.value.includes(tag)) {
                newTag.value = '';
                return;
            }
            editableTags.value.push(tag);
            newTag.value = '';
        };

        const removeEditableTag = (tagToRemove) => {
            editableTags.value = editableTags.value.filter(t => t !== tagToRemove);
        };

        const saveBookChanges = async () => {
            try {
                // Save permission if changed (owner only)
                if (isOwner.value && editablePermission.value !== permission.value) {
                    await api.updateBookPermission(book.value.id, editablePermission.value);
                    permission.value = editablePermission.value;
                }
                await api.updateBook(book.value.id, {
                    description: editableDescription.value,
                    tags: editableTags.value
                });
                book.value.description = editableDescription.value;
                book.value.tags = [...editableTags.value];
                showInfoModal.value = false;
            } catch (e) { globalModal.showAlert('儲存失敗'); }
        };

        onMounted(loadBook);

        onUnmounted(() => {
            if (sortableInstance) {
                sortableInstance.destroy();
                sortableInstance = null;
            }
        });

        return {
            book, createNote,
            editableDescription, editableTags, newTag, editablePermission,
            addEditableTag, removeEditableTag, saveBookChanges, initInfoModal,
            permission, isOwner, canEdit, canAddNote,
            permissionOptions, handlePermissionChange,
            notesList,
            // Info modal
            showInfoModal,
            infoUserPermissions, infoUserSearchQuery, infoUserSearchResults, infoNewUserPermission,
            infoLoadingUserPermissions, infoSearchUsers, addInfoUserPermission,
            removeInfoUserPermission, updateInfoUserPermissionLevel
        };
    }
};

const Note = {
    template: '#note-template',
    setup() {
        const route = useRoute();
        const router = VueRouter.useRouter();
        const noteId = computed(() => route.params.id);

        const editorTextarea = ref(null);
        const previewContainer = ref(null);
        const previewContent = ref(null);
        const content = ref('');
        const title = ref('');
        const renderedContent = ref('');
        const toc = ref([]);
        const activeTocId = ref('');
        const saving = ref(false);
        const permission = ref('private');
        const effectivePermission = ref('private'); // Actual permission after resolving inherit
        const isOwner = ref(false);
        const bookId = ref(null); // Track if note belongs to a book
        const book = ref(null); // Store book info if note is in a book

        // Note Info Modal
        const showNoteInfoModal = ref(false);
        const noteInfoModalTab = ref('info'); // 'info' or 'permission'
        const noteCommentsEnabled = ref(true); // Default to enabled (inverse of commentsDisabled)

        // Editor statistics
        const charCount = computed(() => content.value.length);
        const lineCount = computed(() => content.value.split('\n').length);
        const selectedLines = ref(0);
        const selectedChars = ref(0);

        // Note metadata for preview info bar
        const noteOwner = ref(null);
        const lastEditor = ref(null);
        const updatedAt = ref(null);
        const lastEditedAt = ref(null);

        // Format relative time (e.g., "5 分鐘前", "3 小時前", "2 天前")
        const formatRelativeTime = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffSeconds / 60);
            const diffHours = Math.floor(diffMinutes / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffDays > 0) return `${diffDays} 天前`;
            if (diffHours > 0) return `${diffHours} 小時前`;
            if (diffMinutes > 0) return `${diffMinutes} 分鐘前`;
            return '剛剛';
        };

        const relativeUpdatedTime = computed(() => formatRelativeTime(updatedAt.value));
        const relativeLastContentEditedTime = computed(() => formatRelativeTime(lastEditedAt.value));

        // Sidebar state
        const showSidebar = ref(false);
        const showCreateBookModalLocal = ref(false);
        const newBookTitle = ref('');
        const newBookDescription = ref('');

        // App version
        const appVersion = ref('');
        const loadAppVersion = async () => {
            try {
                const response = await fetch('/api/version');
                const data = await response.json();
                appVersion.value = data.version || '';
            } catch (e) {
                console.error('[Note] Failed to load version:', e);
            }
        };

        // --- Comments ---
        const comments = ref([]);
        const newComment = ref('');
        const commentsEnabled = ref(true);
        const submittingComment = ref(false);
        const commentTextareaFocused = ref(false);
        const commentTextarea = ref(null);
        const commentPreviewMode = ref(false);

        const autoGrowCommentTextarea = () => {
            const textarea = commentTextarea.value;
            if (!textarea) return;
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';
            // Set height to scrollHeight, but max 192px (8 lines approx)
            const maxHeight = 192;
            textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
        };

        const handleCommentBlur = () => {
            if (!newComment.value.trim()) {
                commentTextareaFocused.value = false;
            }
        };

        const loadComments = async () => {
            try {
                const response = await fetch(`/api/notes/${noteId.value}/comments`);
                if (response.ok) {
                    comments.value = await response.json();
                }
            } catch (e) {
                console.error('[Note] Failed to load comments:', e);
            }
        };

        const loadFeaturesConfig = async () => {
            try {
                const response = await fetch('/api/config/features');
                if (response.ok) {
                    const data = await response.json();
                    commentsEnabled.value = data.comments !== false;
                }
            } catch (e) {
                console.error('[Note] Failed to load features config:', e);
            }
        };

        const submitComment = async () => {
            if (!newComment.value.trim() || submittingComment.value) return;

            submittingComment.value = true;
            try {
                const response = await fetch(`/api/notes/${noteId.value}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: newComment.value.trim() })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error);
                }
                const comment = await response.json();
                comments.value.unshift(comment);
                newComment.value = '';
                commentPreviewMode.value = false;
            } catch (e) {
                globalModal.showAlert('留言失敗：' + e.message);
            } finally {
                submittingComment.value = false;
            }
        };

        const deleteComment = async (commentId) => {
            if (!await globalModal.showConfirm('確定要刪除這則留言嗎？')) return;
            try {
                const response = await fetch(`/api/comments/${commentId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error);
                }
                comments.value = comments.value.filter(c => c.id !== commentId);
            } catch (e) {
                globalModal.showAlert('刪除失敗：' + e.message);
            }
        };

        const canDeleteComment = (comment) => {
            if (!currentUser.value) return false;
            const isAuthor = comment.userId === currentUser.value.id;
            const isAdmin = currentUser.value.role === 'super-admin' || currentUser.value.role === 'admin';
            const isNoteOwner = noteOwner.value && noteOwner.value.id === currentUser.value.id;
            return isAuthor || isAdmin || isNoteOwner;
        };

        const canEditComment = (comment) => {
            if (!currentUser.value) return false;
            return comment.userId === currentUser.value.id;
        };

        const formatCommentTime = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return '剛剛';
            if (diffMins < 60) return `${diffMins} 分鐘前`;
            if (diffHours < 24) return `${diffHours} 小時前`;
            if (diffDays < 7) return `${diffDays} 天前`;
            return date.toLocaleDateString('zh-TW');
        };

        // Menu and edit state
        const openMenuId = ref(null);
        const editingCommentId = ref(null);
        const editCommentContent = ref('');
        const replyingToId = ref(null);
        const replyContent = ref('');

        // Computed: top level comments (no parentId)
        const topLevelComments = computed(() => {
            return comments.value.filter(c => !c.parentId);
        });

        // Get replies for a comment
        const getReplies = (commentId) => {
            return comments.value.filter(c => c.parentId === commentId);
        };

        // Toggle menu
        const toggleCommentMenu = (commentId) => {
            openMenuId.value = openMenuId.value === commentId ? null : commentId;
        };

        // Edit functions
        const startEditComment = (comment) => {
            editingCommentId.value = comment.id;
            editCommentContent.value = comment.content;
            openMenuId.value = null;
        };

        const cancelEditComment = () => {
            editingCommentId.value = null;
            editCommentContent.value = '';
        };

        const saveEditComment = async (commentId) => {
            if (!editCommentContent.value.trim()) return;
            try {
                const response = await fetch(`/api/comments/${commentId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: editCommentContent.value.trim() })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error);
                }
                const updated = await response.json();
                const idx = comments.value.findIndex(c => c.id === commentId);
                if (idx !== -1) {
                    comments.value[idx] = updated;
                }
                cancelEditComment();
            } catch (e) {
                globalModal.showAlert('編輯失敗：' + e.message);
            }
        };

        // Reply functions
        const startReply = (comment) => {
            replyingToId.value = comment.id;
            replyContent.value = '';
        };

        const cancelReply = () => {
            replyingToId.value = null;
            replyContent.value = '';
        };

        const submitReply = async (parentId) => {
            if (!replyContent.value.trim()) return;
            try {
                const response = await fetch(`/api/notes/${noteId.value}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: replyContent.value.trim(),
                        parentId: parentId
                    })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error);
                }
                const reply = await response.json();
                comments.value.unshift(reply);
                cancelReply();
            } catch (e) {
                globalModal.showAlert('回覆失敗：' + e.message);
            }
        };

        // Close menu when clicking outside
        const closeCommentMenu = (e) => {
            if (openMenuId.value !== null) {
                openMenuId.value = null;
            }
        };

        // Render basic markdown for comments (bold, italic, code, links)
        const renderCommentMarkdown = (text) => {
            if (!text) return '';
            let html = text
                // Escape HTML first
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                // Code blocks (```)
                .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs my-1 overflow-x-auto"><code>$1</code></pre>')
                // Inline code (`)
                .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded text-xs">$1</code>')
                // Bold (**)
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                // Italic (*)
                .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                // Strikethrough (~~)
                .replace(/~~([^~]+)~~/g, '<del>$1</del>')
                // Links [text](url)
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline">$1</a>')
                // Newlines
                .replace(/\n/g, '<br>');
            return html;
        };

        // Save note settings (commentsDisabled toggle)
        const saveNoteSettings = async () => {
            try {
                await api.updateNote(noteId.value, {
                    commentsDisabled: !noteCommentsEnabled.value
                });
                showNoteInfoModal.value = false;
            } catch (e) {
                globalModal.showAlert('儲存失敗：' + e.message);
            }
        };

        const createNewNote = async () => {
            try {
                const note = await api.createNote();
                router.push('/note/' + note.id);
                showSidebar.value = false;
            } catch (e) { globalModal.showAlert('Error creating note'); }
        };

        const openCreateBookModal = () => {
            newBookTitle.value = '';
            newBookDescription.value = '';
            showCreateBookModalLocal.value = true;
            showSidebar.value = false;
        };

        const createBookFromNote = async () => {
            if (!newBookTitle.value.trim()) {
                globalModal.showAlert('請輸入書本標題');
                return;
            }
            try {
                const book = await api.createBook({
                    title: newBookTitle.value.trim(),
                    description: newBookDescription.value.trim()
                });
                showCreateBookModalLocal.value = false;
                router.push('/book/' + book.id);
            } catch (e) { globalModal.showAlert('Error creating book'); }
        };

        // Settings modal state
        const showSettingsModal = ref(false);
        const showPermissionModal = ref(false);
        const currentUser = ref(null);
        const theme = ref(localStorage.getItem('theme') || 'light');

        // User permissions state
        const userPermissions = ref([]);
        const userSearchQuery = ref('');
        const userSearchResults = ref([]);
        const newUserPermission = ref('edit');
        const loadingUserPermissions = ref(false);

        const loadUserPermissions = async () => {
            if (!isOwner.value) return;
            loadingUserPermissions.value = true;
            try {
                userPermissions.value = await api.getNoteUserPermissions(noteId.value);
            } catch (e) {
                console.error('Failed to load user permissions', e);
            } finally {
                loadingUserPermissions.value = false;
            }
        };

        const searchUsers = debounce(async () => {
            if (userSearchQuery.value.length < 2) {
                userSearchResults.value = [];
                return;
            }
            try {
                const results = await api.searchUsers(userSearchQuery.value);
                // Filter out owner and users already in permissions list
                userSearchResults.value = results.filter(u =>
                    u.id !== noteOwner.value?.id &&
                    !userPermissions.value.find(p => p.userId === u.id)
                );
            } catch (e) {
                console.error('Failed to search users', e);
            }
        }, 300);

        const addUserPermission = async (user) => {
            try {
                await api.addNoteUserPermission(noteId.value, user.id, newUserPermission.value);
                await loadUserPermissions();
                userSearchQuery.value = '';
                userSearchResults.value = [];
            } catch (e) {
                globalModal.showAlert('新增失敗：' + e.message);
            }
        };

        const removeUserPermission = async (userId) => {
            try {
                await api.removeNoteUserPermission(noteId.value, userId);
                userPermissions.value = userPermissions.value.filter(p => p.userId !== userId);
            } catch (e) {
                globalModal.showAlert('移除失敗：' + e.message);
            }
        };

        const updateUserPermissionLevel = async (perm, newLevel) => {
            try {
                await api.addNoteUserPermission(noteId.value, perm.userId, newLevel);
                perm.permission = newLevel;
            } catch (e) {
                globalModal.showAlert('更新失敗：' + e.message);
            }
        };

        // Watch for permission modal open to load user permissions
        watch(showPermissionModal, (val) => {
            if (val) loadUserPermissions();
        });

        // User Profile Modal for Note Page
        const showUserProfileModal = ref(false);
        const editableName = ref('');
        const avatarPreview = ref('');
        const avatarFile = ref(null);
        const savingProfile = ref(false);
        const avatarRemoved = ref(false);

        const openUserProfileModal = () => {
            if (!currentUser.value) return;
            editableName.value = currentUser.value.name || '';
            avatarPreview.value = currentUser.value.avatar || '';
            avatarFile.value = null;
            avatarRemoved.value = false;
            showUserProfileModal.value = true;
        };

        const handleAvatarChange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                // Compress image before storing
                const compressedFile = await compressImage(file);
                avatarFile.value = compressedFile;
                avatarRemoved.value = false;

                // Preview compressed image
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.value = e.target.result;
                };
                reader.readAsDataURL(compressedFile);
            } catch (e) {
                globalModal.showAlert('圖片處理失敗：' + e.message);
            }
        };

        const removeAvatar = () => {
            avatarPreview.value = '';
            avatarFile.value = null;
            avatarRemoved.value = true;
        };

        const saveProfile = async () => {
            savingProfile.value = true;
            try {
                let avatarUrl = currentUser.value.avatar;

                if (avatarRemoved.value) {
                    avatarUrl = null;
                } else if (avatarFile.value) {
                    const uploadResult = await api.uploadAvatar(avatarFile.value);
                    avatarUrl = uploadResult.url;
                }

                const result = await api.updateProfile({
                    name: editableName.value,
                    avatar: avatarUrl
                });

                if (currentUser.value) {
                    currentUser.value.name = result.name;
                    currentUser.value.avatar = result.avatar;
                }

                currentUserCache = null;
                avatarRemoved.value = false;
                showUserProfileModal.value = false;
            } catch (e) {
                globalModal.showAlert('儲存失敗：' + e.message);
            } finally {
                savingProfile.value = false;
            }
        };

        const setTheme = (newTheme) => {
            theme.value = newTheme;
            localStorage.setItem('theme', newTheme);
            if (newTheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        const logout = async () => {
            try {
                await api.logout();
                router.push('/login');
            } catch (e) { console.error('Logout failed', e); }
        };

        // Load current user
        getCurrentUser().then(user => {
            currentUser.value = user;
        });

        // Online users tracking
        const onlineUsers = ref([]);
        const showOnlineUsersPopup = ref(false);
        const toggleOnlineUsersPopup = () => {
            showOnlineUsersPopup.value = !showOnlineUsersPopup.value;
        };
        const canEdit = ref(true);

        // Permission options - 'inherit' is only available for notes inside a book
        const permissionOptions = computed(() => {
            const baseOptions = [
                { value: 'public-edit', label: '可編輯' },
                { value: 'auth-edit', label: '可編輯 (需登入)' },
                { value: 'public-view', label: '唯讀' },
                { value: 'auth-view', label: '唯讀 (需登入)' },
                { value: 'private', label: '私人' }
            ];
            if (bookId.value) {
                return [{ value: 'inherit', label: '繼承書本' }, ...baseOptions];
            }
            return baseOptions;
        });
        // Parse extended code block syntax: language + modifiers (!, =, =N)
        // Examples: python!, javascript=, python!=30, =10
        const parseCodeBlockInfo = (info) => {
            const result = {
                language: '',
                wordWrap: false,
                lineNumbers: false,
                startLine: 1
            };

            if (!info) return result;

            // Match pattern: [language][!][=][startLineNumber]
            // Examples: python, python!, python=, python=10, python!=, python!=10, !=, =10, !
            const match = info.match(/^([a-zA-Z0-9_+-]*)(!?)(=?)(\d*)$/);
            if (match) {
                result.language = match[1] || '';
                result.wordWrap = match[2] === '!';
                result.lineNumbers = match[3] === '=';
                if (match[4]) {
                    result.startLine = parseInt(match[4], 10);
                    result.lineNumbers = true; // If start number specified, enable line numbers
                }
            } else {
                // Fallback: treat as language only
                result.language = info;
            }

            return result;
        };

        const md = window.markdownit({
            html: true,
            breaks: true,
            linkify: true,
            highlight: function (str, lang) {
                const parsed = parseCodeBlockInfo(lang);
                const actualLang = parsed.language.toLowerCase();

                // Handle mermaid code blocks specially
                if (actualLang === 'mermaid') {
                    return '<div class="mermaid">' + str + '</div>';
                }

                // Build CSS classes
                const classes = ['hljs'];
                if (parsed.wordWrap) classes.push('code-wrap');
                if (parsed.lineNumbers) classes.push('has-line-numbers');

                let highlightedCode;
                if (parsed.language && hljs.getLanguage(parsed.language)) {
                    try {
                        highlightedCode = hljs.highlight(str, { language: parsed.language, ignoreIllegals: true }).value;
                    } catch (__) {
                        highlightedCode = md.utils.escapeHtml(str);
                    }
                } else {
                    highlightedCode = md.utils.escapeHtml(str);
                }

                // If line numbers are enabled, wrap with line number display
                if (parsed.lineNumbers) {
                    const lines = highlightedCode.split('\n');
                    // Remove trailing empty line if present
                    if (lines.length > 0 && lines[lines.length - 1] === '') {
                        lines.pop();
                    }

                    const lineNumbersHtml = lines.map((_, i) =>
                        `<span class="code-line-number">${parsed.startLine + i}</span>`
                    ).join('');

                    const codeHtml = lines.map(line =>
                        `<span class="code-line">${line || ' '}</span>`
                    ).join('');

                    return `<pre class="${classes.join(' ')}"><code><div class="code-line-numbers">${lineNumbersHtml}</div><div class="code-content">${codeHtml}</div></code></pre>`;
                }

                return `<pre class="${classes.join(' ')}"><code>${highlightedCode}</code></pre>`;
            }
        });

        // Configure Markdown-it plugins
        if (window.markdownitContainer) {
            ['success', 'info', 'warning', 'danger'].forEach(type => {
                md.use(window.markdownitContainer, type, {
                    render: function (tokens, idx) {
                        const m = tokens[idx].info.trim().match(new RegExp(`^${type}\\s*(.*)$`));
                        if (tokens[idx].nesting === 1) {
                            // opening tag
                            return '<div class="alert alert-' + type + '">\n' +
                                (m[1] ? '<strong>' + md.utils.escapeHtml(m[1]) + '</strong>' : '');
                        } else {
                            // closing tag
                            return '</div>\n';
                        }
                    }
                });
            });

            // Spoiler
            md.use(window.markdownitContainer, 'spoiler', {
                validate: function (params) {
                    return params.trim().match(/^spoiler\s+(.*)$/);
                },
                render: function (tokens, idx) {
                    var m = tokens[idx].info.trim().match(/^spoiler\s+(.*)$/);
                    if (tokens[idx].nesting === 1) {
                        // opening tag
                        return '<details><summary>' + md.utils.escapeHtml(m[1]) + '</summary>\n';
                    } else {
                        // closing tag
                        return '</details>\n';
                    }
                }
            });
        }

        // if (window.markdownitImsize) md.use(window.markdownitImsize);
        if (window["markdown-it-imsize.js"]) md.use(window["markdown-it-imsize.js"]);

        if (window.markdownItAnchor) {
            md.use(window.markdownItAnchor, {
                permalink: true,
                permalinkBefore: true,
                permalinkSymbol: '#'
            });
        }

        if (window.markdownitMark) md.use(window.markdownitMark);
        if (window.markdownitSup) md.use(window.markdownitSup);
        if (window.markdownitEmoji) md.use(window.markdownitEmoji);
        if (window.markdownitTaskLists) md.use(window.markdownitTaskLists, { enabled: true });

        const themes = [
            { label: '[深色] 預設 (Monokai)', value: 'monokai' },
            { label: '[深色] 3024 Night', value: '3024-night' },
            { label: '[深色] Ayu Dark', value: 'ayu-dark' },
            { label: '[深色] Bespin', value: 'bespin' },
            { label: '[深色] Colorforth', value: 'colorforth' },
            { label: '[深色] Dracula', value: 'dracula' },
            { label: '[深色] Duotone Dark', value: 'duotone-dark' },
            { label: '[深色] Material Palenight', value: 'material-palenight' },
            { label: '[深色] Material', value: 'material' },
            { label: '[深色] Nord', value: 'nord' },
            { label: '[深色] One Dark', value: 'one-dark' },
            { label: '[深色] Rubyblue', value: 'rubyblue' },
            { label: '[深色] XQ Dark', value: 'xq-dark' },

            { label: '[亮色] 預設', value: 'default' },
            { label: '[亮色] 3024 Day', value: '3024-day' },
            { label: '[亮色] Eclipse', value: 'eclipse' },
            { label: '[亮色] Solarized', value: 'solarized' },
            { label: '[亮色] XQ Light', value: 'xq-light' },
        ];
        const selectedTheme = ref(localStorage.getItem('NoteHubMD-editorTheme') || 'monokai');

        let cmInstance = null;

        // Mode handling - read mode from URL query keys (e.g., ?edit, ?both, ?view)
        const getModeFromQuery = (query) => {
            if ('edit' in query) return 'edit';
            if ('view' in query) return 'view';
            if ('both' in query) return 'both';
            return 'both'; // default
        };
        const mode = ref(getModeFromQuery(route.query));

        const showEditor = computed(() => mode.value === 'both' || mode.value === 'edit');
        const showPreview = computed(() => mode.value === 'both' || mode.value === 'view');

        const setMode = (newMode) => {
            mode.value = newMode;
            // Set URL as ?edit, ?both, or ?view (key only, no value)
            router.replace({ query: { [newMode]: null } });
            nextTick(() => {
                if (cmInstance) cmInstance.refresh();
            });
        };

        const updatePreview = () => {
            const html = md.render(content.value);

            if (window.morphdom && previewContent.value) {
                // DOM Diffing with morphdom
                const target = previewContent.value;
                const newEl = target.cloneNode(false);
                newEl.innerHTML = html;
                window.morphdom(target, newEl);
            } else if (previewContent.value) {
                // Fallback
                previewContent.value.innerHTML = html;
            }

            // Keep reference updated (though v-html is removed)
            renderedContent.value = html;

            generateToc();
            // Re-render mermaid diagrams after content update
            nextTick(() => {
                if (window.mermaid && previewContainer.value) {
                    try {
                        window.mermaid.run({
                            nodes: previewContainer.value.querySelectorAll('.mermaid')
                        });
                    } catch (e) {
                        console.error('Mermaid rendering error:', e);
                    }
                }
            });
        };

        // Generate TOC from content (h1, h2, h3)
        const generateToc = () => {
            const headings = [];
            const lines = content.value.split('\n');
            let headingIndex = 0;

            lines.forEach((line) => {
                const match = line.match(/^(#{1,3})\s+(.+)$/);
                if (match) {
                    const level = match[1].length;
                    const text = match[2].trim();
                    const id = 'heading-' + headingIndex++;
                    headings.push({ id, level, text });
                }
            });

            toc.value = headings;

            // Set first heading as active by default
            if (headings.length > 0) {
                activeTocId.value = headings[0].id;
            }
        };

        // Scroll to heading in preview
        const scrollToHeading = (id) => {
            if (!previewContainer.value) return;

            const index = parseInt(id.replace('heading-', ''));
            const headings = previewContainer.value.querySelectorAll('h1, h2, h3');

            if (headings[index]) {
                headings[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        const extractTitle = (text) => {
            const match = text.match(/^#\s+(.+)$/m);
            return match ? match[1] : 'Untitled';
        };

        // Sync Scroll
        let isScrollingSynced = false; // Prevent scroll loop

        const handleEditorScroll = (cm) => {
            if (mode.value !== 'both' || !previewContainer.value || isScrollingSynced) return;

            isScrollingSynced = true;
            const scrollInfo = cm.getScrollInfo();
            const percentage = scrollInfo.top / (scrollInfo.height - scrollInfo.clientHeight);

            const preview = previewContainer.value;
            preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);

            setTimeout(() => { isScrollingSynced = false; }, 50);
        };

        const handlePreviewScroll = (e) => {
            // Sync scroll in both mode
            if (mode.value === 'both' && cmInstance && !isScrollingSynced) {
                isScrollingSynced = true;
                const preview = e.target;
                const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);

                const scrollInfo = cmInstance.getScrollInfo();
                const targetScrollTop = percentage * (scrollInfo.height - scrollInfo.clientHeight);
                cmInstance.scrollTo(null, targetScrollTop);

                setTimeout(() => { isScrollingSynced = false; }, 50);
            }

            // Update active TOC item in view mode
            if (mode.value === 'view' && previewContainer.value) {
                updateActiveTocItem();
            }
        };

        // Update active TOC item based on scroll position
        const updateActiveTocItem = () => {
            if (!previewContainer.value || toc.value.length === 0) return;

            const headings = previewContainer.value.querySelectorAll('h1, h2, h3');
            const containerTop = previewContainer.value.scrollTop;
            const offset = 80; // offset from top

            let activeId = '';
            headings.forEach((heading, index) => {
                const headingTop = heading.offsetTop - previewContainer.value.offsetTop;
                if (headingTop <= containerTop + offset) {
                    activeId = 'heading-' + index;
                }
            });

            activeTocId.value = activeId;
        };

        const saveContent = debounce(async (newContent, newTitle) => {
            saving.value = true;
            try {
                await api.updateNote(noteId.value, { content: newContent, title: newTitle });
            } catch (e) {
                console.error('Save failed', e);
            } finally {
                saving.value = false;
            }
        }, 1000);

        const handleGlobalSave = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                if (cmInstance) {
                    const val = cmInstance.getValue();
                    const newTitle = extractTitle(val);
                    saveContent(val, newTitle);
                }
            }
        };

        const handlePermissionChange = async (newPermission) => {
            try {
                await api.updatePermission(noteId.value, newPermission);
                permission.value = newPermission;
            } catch (e) {
                console.error('Failed to update permission', e);
                globalModal.showAlert('無法更新權限：' + e.message);
            }
        };

        const handleTaskListClick = (event) => {
            const target = event.target;
            // Check if checkbox
            if (!target.classList.contains('task-list-item-checkbox')) return;

            // Check if editable
            if (!canEdit.value) return;

            // Find index of clicked checkbox
            const checkboxes = previewContainer.value.querySelectorAll('.task-list-item-checkbox');
            let index = -1;
            for (let i = 0; i < checkboxes.length; i++) {
                if (checkboxes[i] === target) {
                    index = i;
                    break;
                }
            }
            if (index === -1) return;

            // Parse tokens to find the corresponding source line
            const tokens = md.parse(content.value, {});
            let checkboxIndex = 0;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                // markdown-it-task-lists adds 'task-list-item' class to list_item_open tokens
                if (token.type === 'list_item_open' && token.attrs) {
                    const classAttr = token.attrs.find(attr => attr[0] === 'class');
                    if (classAttr && classAttr[1].includes('task-list-item')) {
                        if (checkboxIndex === index) {
                            // Found the token!
                            const lineNo = token.map[0]; // Start line of the item
                            const lineContent = cmInstance.getLine(lineNo);

                            // Toggle checkbox in line content
                            const newLineContent = lineContent.replace(/\[([ xX])\]/, (match, p1) => {
                                return p1 === ' ' ? '[x]' : '[ ]';
                            });

                            if (newLineContent !== lineContent) {
                                cmInstance.replaceRange(
                                    newLineContent,
                                    { line: lineNo, ch: 0 },
                                    { line: lineNo, ch: lineContent.length }
                                );
                            }
                            return;
                        }
                        checkboxIndex++;
                    }
                }
            }
        };

        // --- Lightbox for images ---
        const lightboxImage = ref(null);

        const handlePreviewClick = (event) => {
            const target = event.target;

            // Handle task list checkbox clicks
            if (target.classList.contains('task-list-item-checkbox')) {
                handleTaskListClick(event);
                return;
            }

            // Handle image clicks for lightbox
            if (target.tagName === 'IMG' && !target.closest('.mermaid')) {
                lightboxImage.value = target.src;
            }
        };

        const closeLightbox = () => {
            lightboxImage.value = null;
        };

        // --- Image Upload ---
        const uploadImage = async (file) => {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/upload/image', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            return response.json();
        };

        const handleImageDrop = async (cm, e) => {
            // Check if there are image files
            const files = e.dataTransfer?.files;
            if (!files || files.length === 0) return;

            const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            if (imageFiles.length === 0) return;

            e.preventDefault();
            e.stopPropagation();

            for (const file of imageFiles) {
                try {
                    const result = await uploadImage(file);
                    const markdown = `![${file.name}](${result.url})`;
                    const cursor = cm.getCursor();
                    cm.replaceRange(markdown + '\n', cursor);
                } catch (error) {
                    console.error('Upload failed:', error);
                    globalModal.showAlert('圖片上傳失敗：' + error.message);
                }
            }
        };

        const handleImagePaste = async (cm, e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) continue;

                    try {
                        const result = await uploadImage(file);
                        const markdown = `![image](${result.url})`;
                        const cursor = cm.getCursor();
                        cm.replaceRange(markdown, cursor);
                    } catch (error) {
                        console.error('Upload failed:', error);
                        globalModal.showAlert('圖片上傳失敗：' + error.message);
                    }
                    return; // Only handle first image
                }
            }
        };

        // --- Markdown Autocomplete Hints ---
        const markdownHints = [
            // Headings
            { text: '# ', displayText: '# 標題 1', trigger: '#' },
            { text: '## ', displayText: '## 標題 2', trigger: '#' },
            { text: '### ', displayText: '### 標題 3', trigger: '#' },
            { text: '#### ', displayText: '#### 標題 4', trigger: '#' },
            { text: '##### ', displayText: '##### 標題 5', trigger: '#' },
            { text: '###### ', displayText: '###### 標題 6', trigger: '#' },
            { text: '###### tags: `標籤1`、`標籤2`、`標籤3`', displayText: '###### tags: `標籤1`、`標籤2`...', trigger: '#' },
            // Containers
            { text: '::: success\n\n:::', displayText: '::: success (成功提示)', trigger: ':::' },
            { text: '::: info\n\n:::', displayText: '::: info (資訊提示)', trigger: ':::' },
            { text: '::: warning\n\n:::', displayText: '::: warning (警告提示)', trigger: ':::' },
            { text: '::: danger\n\n:::', displayText: '::: danger (危險提示)', trigger: ':::' },
            { text: '::: spoiler 點擊展開\n\n:::', displayText: '::: spoiler (折疊區塊)', trigger: ':::' },
            // Code blocks
            { text: '```\n\n```', displayText: '``` 程式碼區塊', trigger: '`' },
            { text: '```javascript\n\n```', displayText: '```javascript', trigger: '`' },
            { text: '```python\n\n```', displayText: '```python', trigger: '`' },
            { text: '```html\n\n```', displayText: '```html', trigger: '`' },
            { text: '```css\n\n```', displayText: '```css', trigger: '`' },
            { text: '```sql\n\n```', displayText: '```sql', trigger: '`' },
            { text: '```bash\n\n```', displayText: '```bash', trigger: '`' },
            { text: '```mermaid\n\n```', displayText: '```mermaid (流程圖)', trigger: '`' },
            // Links and images
            { text: '[](url)', displayText: '[]() 連結', trigger: '[' },
            { text: '![](image_url)', displayText: '![]() 圖片', trigger: '!' },
            // Lists
            { text: '- [ ] ', displayText: '- [ ] 待辦事項 (未完成)', trigger: '-' },
            { text: '- [x] ', displayText: '- [x] 待辦事項 (已完成)', trigger: '-' },
            // Text formatting
            { text: '**粗體**', displayText: '**粗體**', trigger: '*' },
            { text: '*斜體*', displayText: '*斜體*', trigger: '*' },
            { text: '~~刪除線~~', displayText: '~~刪除線~~', trigger: '~' },
            { text: '==標記==', displayText: '==標記/螢光==', trigger: '=' },
            { text: '^上標^', displayText: '^上標^', trigger: '^' },
            // Tables
            { text: '| 欄位1 | 欄位2 | 欄位3 |\n| --- | --- | --- |\n| 內容1 | 內容2 | 內容3 |', displayText: '| 表格 |', trigger: '|' },
        ];

        const getMarkdownHints = (cm) => {
            const cursor = cm.getCursor();
            const line = cm.getLine(cursor.line);
            const lineStart = line.substring(0, cursor.ch);

            // Find the trigger pattern at the start of the line or current position
            let matchingHints = [];
            let startCh = 0;

            // Check for heading pattern at line start
            const headingMatch = lineStart.match(/^(#{1,6})$/);
            if (headingMatch) {
                startCh = 0;
                const prefix = headingMatch[1];
                matchingHints = markdownHints.filter(h =>
                    h.trigger === '#' && h.text.startsWith(prefix)
                );
            }

            // Check for container pattern at line start
            const containerMatch = lineStart.match(/^(:{1,3})$/);
            if (containerMatch) {
                startCh = 0;
                matchingHints = markdownHints.filter(h => h.trigger === ':::');
            }

            // Check for code block pattern at line start
            const codeMatch = lineStart.match(/^(`{1,3})$/);
            if (codeMatch) {
                startCh = 0;
                matchingHints = markdownHints.filter(h => h.trigger === '`');
            }

            // Check for list pattern at line start
            const listMatch = lineStart.match(/^(-)$/);
            if (listMatch) {
                startCh = 0;
                matchingHints = markdownHints.filter(h => h.trigger === '-');
            }

            // Check for link pattern
            const linkMatch = lineStart.match(/(\[)$/);
            if (linkMatch) {
                startCh = cursor.ch - 1;
                matchingHints = markdownHints.filter(h => h.trigger === '[');
            }

            // Check for image pattern
            const imageMatch = lineStart.match(/(!)$/);
            if (imageMatch) {
                startCh = cursor.ch - 1;
                matchingHints = markdownHints.filter(h => h.trigger === '!');
            }

            // Check for bold/italic pattern
            const boldMatch = lineStart.match(/(\*{1,2})$/);
            if (boldMatch) {
                startCh = cursor.ch - boldMatch[1].length;
                matchingHints = markdownHints.filter(h => h.trigger === '*');
            }

            // Check for strikethrough pattern
            const strikeMatch = lineStart.match(/(~{1,2})$/);
            if (strikeMatch) {
                startCh = cursor.ch - strikeMatch[1].length;
                matchingHints = markdownHints.filter(h => h.trigger === '~');
            }

            // Check for mark pattern
            const markMatch = lineStart.match(/(={1,2})$/);
            if (markMatch) {
                startCh = cursor.ch - markMatch[1].length;
                matchingHints = markdownHints.filter(h => h.trigger === '=');
            }

            // Check for superscript pattern
            const supMatch = lineStart.match(/(\^)$/);
            if (supMatch) {
                startCh = cursor.ch - 1;
                matchingHints = markdownHints.filter(h => h.trigger === '^');
            }

            // Check for table pattern
            const tableMatch = lineStart.match(/(\|)$/);
            if (tableMatch) {
                startCh = cursor.ch - 1;
                matchingHints = markdownHints.filter(h => h.trigger === '|');
            }

            // Check for code block modifiers (e.g., ```javascript)
            // Matches: ```lang or ```lang! or ```lang=
            // Capture groups:
            // 1: backticks
            // 2: language
            // 3: ! (optional)
            // 4: = (optional)
            const codeModMatch = lineStart.match(/^(`{3,})([a-zA-Z0-9_\-]+)(!?)(=?)$/);
            if (codeModMatch) {
                // Only trigger if we are at the end of the line (cursor matches line length) checking logic already gets lineStart as substring to cursor
                // but lineStart IS what is before cursor.

                startCh = cursor.ch;
                const hasWrap = codeModMatch[3] === '!';
                const hasLineNums = codeModMatch[4] === '=';

                // Dynamic hints
                if (!hasWrap && !hasLineNums) {
                    matchingHints.push({ text: '!', displayText: '! (自動換行)' });
                    matchingHints.push({ text: '=', displayText: '= (加上行號)' });
                } else if (hasWrap && !hasLineNums) {
                    matchingHints.push({ text: '=', displayText: '= (加上行號)' });
                }
            }

            if (matchingHints.length === 0) {
                return null;
            }

            return {
                list: matchingHints.map(hint => ({
                    text: hint.text,
                    displayText: hint.displayText,
                    hint: (cm, data, completion) => {
                        cm.replaceRange(
                            completion.text,
                            { line: cursor.line, ch: startCh },
                            cursor
                        );
                        // Position cursor appropriately
                        const newCursor = cm.getCursor();
                        // For code blocks and containers, move cursor to middle
                        if (completion.text.includes('\n\n')) {
                            const lines = completion.text.split('\n');
                            cm.setCursor({ line: cursor.line + 1, ch: 0 });
                        }
                    }
                })),
                from: { line: cursor.line, ch: startCh },
                to: cursor
            };
        };

        const triggerMarkdownHint = (cm) => {
            if (!canEdit.value) return;

            cm.showHint({
                hint: getMarkdownHints,
                completeSingle: false,
                closeOnUnfocus: true,
                closeCharacters: /[\s]/
            });
        };

        onMounted(async () => {
            // Global Ctrl+S handler
            window.addEventListener('keydown', handleGlobalSave);

            // Close comment menu on outside click
            document.addEventListener('click', (e) => {
                if (openMenuId.value !== null) {
                    // Check if click is inside a comment menu button or the menu itself
                    const isMenuButton = e.target.closest('[data-comment-menu]');
                    const isMenu = e.target.closest('.comment-menu-dropdown');
                    if (!isMenuButton && !isMenu) {
                        openMenuId.value = null;
                    }
                }
            });

            // Load app version
            loadAppVersion();

            // Load comments and features config
            loadComments();
            loadFeaturesConfig();

            // Initialize Mermaid
            if (window.mermaid) {
                const isDark = document.documentElement.classList.contains('dark');
                window.mermaid.initialize({
                    startOnLoad: false,
                    theme: isDark ? 'dark' : 'default',
                    securityLevel: 'loose'
                });
            }

            // Fetch Note
            try {
                const note = await api.getNote(noteId.value);
                content.value = note.content || '';
                title.value = note.title || 'Untitled';
                permission.value = note.permission || 'private';
                effectivePermission.value = note.effectivePermission || note.permission || 'private';
                isOwner.value = note.isOwner || false;
                canEdit.value = note.canEdit !== undefined ? note.canEdit : true;
                bookId.value = note.bookId || null;
                book.value = note.Book || null;
                noteOwner.value = note.owner || null;
                lastEditor.value = note.lastEditor || null;
                updatedAt.value = note.updatedAt || null;
                lastEditedAt.value = note.lastEditedAt || null;
                noteCommentsEnabled.value = !note.commentsDisabled; // Invert: true means enabled

                // If user can't edit and no specific mode was requested, default to 'view' mode
                if (!canEdit.value && !('edit' in route.query) && !('both' in route.query) && !('view' in route.query)) {
                    mode.value = 'view';
                }
            } catch (e) {
                console.error('Failed to load note', e);
                // Handle access errors
                if (e.message.includes('Login required')) {
                    globalModal.showAlert('需要登入才能存取此筆記');
                    // Use window.location to get the actual current URL
                    const currentPath = window.location.pathname + window.location.search;
                    router.push({ path: '/login', query: { redirect: currentPath } });
                    return;
                } else if (e.message.includes('Access denied')) {
                    globalModal.showAlert('您沒有權限存取此筆記');
                    router.push('/');
                    return;
                }
            }

            if (editorTextarea.value) {
                cmInstance = CodeMirror.fromTextArea(editorTextarea.value, {
                    mode: 'markdown',
                    theme: selectedTheme.value,
                    lineNumbers: true,
                    lineWrapping: true,
                    readOnly: !canEdit.value,
                    placeholder: '寫些什麼東西吧~',
                });
                // cmInstance.setSize(null, "100%");

                cmInstance.setValue(content.value);

                cmInstance.on('change', (cm) => {
                    const val = cm.getValue();
                    if (val !== content.value) {
                        content.value = val;
                        const newTitle = extractTitle(val);
                        if (newTitle !== title.value) {
                            title.value = newTitle;
                        }
                        updatePreview();
                        // Emit change
                        socket.emit('edit-note', { noteId: noteId.value, content: val });
                        // Save to DB
                        saveContent(val, newTitle);
                    }
                });

                cmInstance.on('scroll', handleEditorScroll);

                // Track selection for editor statistics
                cmInstance.on('cursorActivity', (cm) => {
                    const selections = cm.listSelections();
                    const selectedText = cm.getSelection();
                    selectedChars.value = selectedText.length;

                    if (selections.length === 1 && cm.somethingSelected()) {
                        const sel = selections[0];
                        const fromLine = Math.min(sel.anchor.line, sel.head.line);
                        const toLine = Math.max(sel.anchor.line, sel.head.line);
                        selectedLines.value = toLine - fromLine + 1;
                    } else {
                        selectedLines.value = 0;
                    }
                });

                // Image upload - drag and drop
                const wrapper = cmInstance.getWrapperElement();
                wrapper.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                });
                wrapper.addEventListener('drop', (e) => handleImageDrop(cmInstance, e));

                // Image upload - paste
                cmInstance.on('paste', (cm, e) => handleImagePaste(cm, e));

                // Markdown autocomplete hints
                cmInstance.on('inputRead', (cm, change) => {
                    if (!canEdit.value) return;
                    // Removed strict origin check to support IME and other input sources
                    // if (change.origin !== '+input') return;

                    const cursor = cm.getCursor();
                    const line = cm.getLine(cursor.line);
                    const lineStart = line.substring(0, cursor.ch);

                    // Trigger when typing these patterns (no trailing whitespace required)
                    const triggerPatterns = [
                        /^#{1,6}$/,              // Headings (e.g., "###")
                        /^:{1,3}$/,               // Containers (e.g., ":::")
                        /^`{1,3}$/,               // Code blocks (e.g., "```")
                        /^`{3,}[a-zA-Z0-9_\-]+(!?)(=?)$/, // Code block modifiers (e.g., "```javascript")
                        /^-$/,                    // Lists
                        /\[$/,                    // Links (anywhere on line)
                        /!$/,                     // Images (anywhere on line)
                        /\*{1,2}$/,               // Bold/italic (anywhere on line)
                        /~{1,2}$/,                // Strikethrough (anywhere on line)
                        /={1,2}$/,                // Highlight (anywhere on line)
                        /\^$/,                    // Superscript (anywhere on line)
                        /\|$/,                    // Tables (anywhere on line)
                    ];

                    const shouldTrigger = triggerPatterns.some(pattern => pattern.test(lineStart));
                    if (shouldTrigger) {
                        triggerMarkdownHint(cm);
                    }
                });

                // Initial render
                updatePreview();

                // Register socket listeners FIRST (before join-note)
                socket.on('users-in-note', (users) => {
                    console.log('Received users-in-note:', users);
                    onlineUsers.value = users;
                });

                socket.on('note-updated', (newContent) => {
                    if (newContent !== content.value) {
                        const cursor = cmInstance.getCursor();
                        content.value = newContent;
                        title.value = extractTitle(newContent);
                        cmInstance.setValue(newContent);
                        cmInstance.setCursor(cursor);
                        updatePreview();
                    }
                });

                // Socket Join - get username and send with join (after listeners are ready)
                const currentUser = await getCurrentUser();
                const username = currentUser?.username || 'Guest';
                console.log('Joining note:', noteId.value, 'as', username);
                socket.emit('join-note', { noteId: noteId.value, username });
            }
        });

        // Cleanup on unmount
        onUnmounted(() => {
            window.removeEventListener('keydown', handleGlobalSave);
            socket.emit('leave-note', noteId.value);
            socket.off('users-in-note');
            socket.off('note-updated');
        });

        watch(selectedTheme, (newTheme) => {
            localStorage.setItem('NoteHubMD-editorTheme', newTheme);
            if (cmInstance) {
                cmInstance.setOption('theme', newTheme);
            }
        });

        watch(() => route.query, (newQuery) => {
            const newMode = getModeFromQuery(newQuery);
            if (newMode !== mode.value) {
                mode.value = newMode;
            }
            nextTick(() => {
                if (cmInstance) cmInstance.refresh();
            });
        }, { deep: true });

        // Watch for noteId changes (when navigating between notes using router-link)
        watch(noteId, async (newNoteId, oldNoteId) => {
            if (newNoteId && newNoteId !== oldNoteId) {
                // Leave old note room
                if (oldNoteId) {
                    socket.emit('leave-note', oldNoteId);
                }

                // Reload note data
                try {
                    const note = await api.getNote(newNoteId);
                    content.value = note.content || '';
                    title.value = note.title || 'Untitled';
                    permission.value = note.permission || 'private';
                    effectivePermission.value = note.effectivePermission || note.permission || 'private';
                    isOwner.value = note.isOwner || false;
                    canEdit.value = note.canEdit !== undefined ? note.canEdit : true;
                    bookId.value = note.bookId || null;
                    book.value = note.Book || null;
                    noteOwner.value = note.owner || null;
                    lastEditor.value = note.lastEditor || null;
                    updatedAt.value = note.updatedAt || null;
                    lastEditedAt.value = note.lastEditedAt || null;

                    // Update editor content
                    if (cmInstance) {
                        cmInstance.setValue(note.content || '');
                        cmInstance.setOption('readOnly', !canEdit.value);
                    }

                    // Update preview
                    updatePreview();

                    // Join new note room
                    const currentUserData = await getCurrentUser();
                    const username = currentUserData?.username || 'Guest';
                    socket.emit('join-note', { noteId: newNoteId, username });
                } catch (e) {
                    console.error('Failed to load note', e);
                    if (e.message.includes('Login required')) {
                        globalModal.showAlert('需要登入才能存取此筆記');
                        router.push({ path: '/login', query: { redirect: '/note/' + newNoteId } });
                    } else if (e.message.includes('Access denied')) {
                        globalModal.showAlert('您沒有權限存取此筆記');
                        router.push('/');
                    }
                }
            }
        });

        return {
            noteId,
            editorTextarea,
            previewContainer,
            previewContent,
            renderedContent,
            showEditor,
            showPreview,
            mode,
            setMode,
            handlePreviewScroll,
            saving,
            title,
            themes,
            selectedTheme,
            toc,
            activeTocId,
            scrollToHeading,
            permission,
            effectivePermission,
            bookId,
            book,
            isOwner,
            canEdit,
            permissionOptions,
            handlePermissionChange,
            showPermissionModal,
            userPermissions,
            userSearchQuery,
            userSearchResults,
            newUserPermission,
            loadingUserPermissions,
            searchUsers,
            addUserPermission,
            removeUserPermission,
            updateUserPermissionLevel,
            onlineUsers,
            showOnlineUsersPopup,
            toggleOnlineUsersPopup,
            handleTaskListClick,
            handlePreviewClick,
            lightboxImage,
            closeLightbox,
            showSidebar,
            showCreateBookModalLocal,
            newBookTitle,
            newBookDescription,
            createNewNote,
            openCreateBookModal,
            createBookFromNote,
            showSettingsModal,
            currentUser,
            theme,
            setTheme,
            logout,
            charCount,
            lineCount,
            selectedLines,
            selectedChars,
            noteOwner,
            lastEditor,
            relativeUpdatedTime,
            relativeLastContentEditedTime,
            // Profile modal
            showUserProfileModal,
            editableName,
            avatarPreview,
            openUserProfileModal,
            handleAvatarChange,
            removeAvatar,
            saveProfile,
            savingProfile,
            // App version
            appVersion,
            // Comments
            comments,
            newComment,
            commentsEnabled,
            submittingComment,
            submitComment,
            deleteComment,
            canDeleteComment,
            canEditComment,
            formatCommentTime,
            // Edit/Reply/Menu
            openMenuId,
            editingCommentId,
            editCommentContent,
            replyingToId,
            replyContent,
            topLevelComments,
            getReplies,
            toggleCommentMenu,
            startEditComment,
            cancelEditComment,
            saveEditComment,
            startReply,
            cancelReply,
            submitReply,
            renderCommentMarkdown,
            commentTextareaFocused,
            commentTextarea,
            commentPreviewMode,
            autoGrowCommentTextarea,
            handleCommentBlur,
            // Note Info Modal
            showNoteInfoModal,
            noteInfoModalTab,
            noteCommentsEnabled,
            saveNoteSettings
        };
    }
};

const Trash = {
    template: '#trash-template',
    setup() {
        const notes = ref([]);
        const books = ref([]);
        const loading = ref(true);

        const loadTrash = async () => {
            loading.value = true;
            try {
                const data = await api.getTrash();
                notes.value = data.notes || [];
                books.value = data.books || [];
            } catch (e) {
                console.error('Failed to load trash', e);
            } finally {
                loading.value = false;
            }
        };

        const restoreNote = async (id) => {
            try {
                await api.restoreNote(id);
                notes.value = notes.value.filter(n => n.id !== id);
            } catch (e) { globalModal.showAlert('還原失敗'); }
        };

        const forceDeleteNote = async (id) => {
            if (!await globalModal.showConfirm('確定要永久刪除此筆記？此操作無法復原！', { type: 'error' })) return;
            try {
                await api.forceDeleteNote(id);
                notes.value = notes.value.filter(n => n.id !== id);
            } catch (e) { globalModal.showAlert('刪除失敗'); }
        };

        const restoreBook = async (id) => {
            try {
                await api.restoreBook(id);
                books.value = books.value.filter(b => b.id !== id);
            } catch (e) { globalModal.showAlert('還原失敗'); }
        };

        const forceDeleteBook = async (id) => {
            if (!await globalModal.showConfirm('確定要永久刪除此書本？此操作無法復原！', { type: 'error' })) return;
            try {
                await api.forceDeleteBook(id);
                books.value = books.value.filter(b => b.id !== id);
            } catch (e) { globalModal.showAlert('刪除失敗'); }
        };

        onMounted(loadTrash);

        return { notes, books, loading, restoreNote, forceDeleteNote, restoreBook, forceDeleteBook };
    }
};

const Admin = {
    template: '#admin-template',
    setup() {
        const users = ref([]);
        const loading = ref(true);
        const currentUserRole = ref(null);
        const isAdmin = ref(false);

        const formatDateTime = (dateStr) => {
            if (!dateStr) return '—';
            const date = new Date(dateStr);
            return date.toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const formatRelativeTime = (dateStr) => {
            if (!dateStr) return '—';
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return '剛剛';
            if (diffMins < 60) return `${diffMins} 分鐘前`;
            if (diffHours < 24) return `${diffHours} 小時前`;
            if (diffDays < 7) return `${diffDays} 天前`;
            return formatDateTime(dateStr);
        };

        const canChangeRole = (user) => {
            // Cannot change own role
            if (user.id === currentUserCache?.id) return false;
            // Super-admin can change anyone
            if (currentUserRole.value === 'super-admin') return true;
            // Admin can change non-super-admin users
            if (currentUserRole.value === 'admin' && user.role !== 'super-admin') return true;
            return false;
        };

        const updateRole = async (user) => {
            try {
                const response = await fetch(`/api/admin/users/${user.id}/role`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: user.role })
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error);
                }
            } catch (e) {
                globalModal.showAlert('更新失敗：' + e.message);
                // Reload to restore original state
                loadUsers();
            }
        };

        const loadUsers = async () => {
            loading.value = true;
            try {
                // Check current user role
                const me = await api.getMe();
                currentUserCache = me;
                currentUserRole.value = me?.role;
                isAdmin.value = me?.role === 'super-admin' || me?.role === 'admin';

                if (!isAdmin.value) {
                    loading.value = false;
                    return;
                }

                // Fetch users
                const response = await fetch('/api/admin/users');
                if (!response.ok) {
                    throw new Error('Failed to load users');
                }
                users.value = await response.json();
            } catch (e) {
                console.error('Failed to load admin data', e);
                isAdmin.value = false;
            } finally {
                loading.value = false;
            }
        };

        onMounted(loadUsers);

        return {
            users,
            loading,
            isAdmin,
            currentUserRole,
            formatDateTime,
            formatRelativeTime,
            canChangeRole,
            updateRole
        };
    }
};

const routes = [
    { path: '/login', component: Login },
    {
        path: '/',
        component: Layout,
        children: [
            { path: '', component: Home },
            { path: 'book/:id', component: Book },
            { path: 'trash', component: Trash },
            { path: 'admin', component: Admin },
        ]
    },
    { path: '/note/:id', component: Note }, // Note view takes full screen
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

// Global Auth Guard
router.beforeEach(async (to, from, next) => {
    // Allow login page
    if (to.path === '/login') {
        next();
        return;
    }

    // Allow note pages (permission check happens in component/backend)
    if (to.path.startsWith('/note/')) {
        next();
        return;
    }

    // Require auth for other pages
    try {
        await api.getMe();
        next();
    } catch (e) {
        // Save the original path and redirect to login
        next({ path: '/login', query: { redirect: to.fullPath } });
    }
});

const app = createApp({
    setup() {
        // Modal state
        const modal = reactive({
            show: false,
            type: 'alert', // alert, confirm, info, success, warning, error
            title: '',
            message: '',
            confirmText: '確定',
            cancelText: '取消',
            resolve: null
        });

        const showModal = (options) => {
            return new Promise((resolve) => {
                modal.show = true;
                modal.type = options.type || 'alert';
                modal.title = options.title || '';
                modal.message = options.message || '';
                modal.confirmText = options.confirmText || '確定';
                modal.cancelText = options.cancelText || '取消';
                modal.resolve = resolve;
            });
        };

        const showAlert = (message, options = {}) => {
            return showModal({
                type: options.type || 'alert',
                title: options.title || '',
                message,
                confirmText: options.confirmText || '確定'
            });
        };

        const showConfirm = (message, options = {}) => {
            return showModal({
                type: 'confirm',
                title: options.title || '確認',
                message,
                confirmText: options.confirmText || '確定',
                cancelText: options.cancelText || '取消'
            });
        };

        const closeModal = (result = true) => {
            modal.show = false;
            if (modal.resolve) {
                modal.resolve(result);
                modal.resolve = null;
            }
        };

        onMounted(() => {
            const theme = localStorage.getItem('NoteHubMD-theme') || 'dark';
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            // Link global modal helper
            appInstance = { showAlert, showConfirm };
        });

        return {
            modal,
            showModal,
            showAlert,
            showConfirm,
            closeModal
        };
    }
});

app.component('Sidebar', Sidebar);
app.use(router);
app.mount('#app');
