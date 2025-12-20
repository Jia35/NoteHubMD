/**
 * NoteHubMD Home Page Script
 * Handles home, book list, and admin pages
 */

// Use IIFE to avoid polluting global scope
(function () {
    // Get dependencies from common.js
    const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } = window.NoteHubMD.Vue;
    const { createRouter, createWebHistory, useRoute } = window.NoteHubMD.VueRouter;
    const { api, globalModal, setAppInstance, debounce, extractTags, compressImage } = window.NoteHubMD;

    // Get components from components.js
    const { SidebarNav, InfoModal, BookCard, NoteCard } = window.NoteHubMD.components;

    const Sidebar = {
        template: '#sidebar-template',
        components: { SidebarNav },
        props: ['user'],
        setup(props) {
            const route = useRoute();
            const router = VueRouter.useRouter();
            const currentRoute = computed(() => route.path);

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

            // Global View Mode (persisted in localStorage)
            const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my'); // 'my' or 'all'

            const setGlobalViewMode = (mode) => {
                globalViewMode.value = mode;
                localStorage.setItem('NoteHubMD-viewMode', mode);
                window.dispatchEvent(new Event('viewmode-changed'));
            };

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

            // Export Notes
            const exportingNotes = ref(false);

            const exportNotes = async () => {
                if (exportingNotes.value) return;
                exportingNotes.value = true;
                try {
                    const response = await fetch('/api/export/my-notes');
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Export failed');
                    }
                    // Create blob from response and download
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    // Get filename from header or use default
                    const contentDisposition = response.headers.get('Content-Disposition');
                    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
                    a.download = filenameMatch ? filenameMatch[1] : 'notes_export.zip';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                } catch (e) {
                    globalModal.showAlert('匯出失敗：' + e.message);
                } finally {
                    exportingNotes.value = false;
                }
            };

            // Create Note function
            const createNote = async () => {
                try {
                    const note = await api.createNote();
                    window.location.href = '/n/' + note.id;
                } catch (e) { globalModal.showAlert('Error creating note'); }
            };

            // Create Book Modal state and functions
            const showCreateBookModal = ref(false);
            const newBookTitle = ref('');
            const newBookDescription = ref('');
            const newBookTitleInput = ref(null);

            const openCreateBookModal = () => {
                newBookTitle.value = '';
                newBookDescription.value = '';
                showCreateBookModal.value = true;
                nextTick(() => {
                    newBookTitleInput.value?.focus();
                });
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
                    router.push('/b/' + book.id);
                } catch (e) { globalModal.showAlert('Error creating book'); }
            };

            // Sidebar Books list
            const sidebarBooks = ref([]);
            const loadSidebarBooks = async () => {
                try {
                    sidebarBooks.value = await api.getBooks();
                } catch (e) {
                    console.error('[Sidebar] Failed to load books:', e);
                }
            };

            // Filtered sidebar books based on view mode
            const filteredSidebarBooks = computed(() => {
                if (globalViewMode.value === 'my') {
                    return sidebarBooks.value.filter(book => book.isOwner);
                } else {
                    return sidebarBooks.value.filter(book => book.isPublic);
                }
            });

            // Limited sidebar books for display (max 20)
            const limitedSidebarBooks = computed(() => {
                return filteredSidebarBooks.value.slice(0, 20);
            });

            // Check if there are more books beyond the limit
            const hasMoreBooks = computed(() => {
                return filteredSidebarBooks.value.length > 20;
            });

            // Search Modal state and functions
            const showSearchModal = ref(false);
            const searchQuery = ref('');
            const includeContent = ref(false);
            const searchLoading = ref(false);
            const searchResults = ref({ books: [], notes: [] });
            const searchInput = ref(null);
            const allTags = ref([]);
            const selectedTag = ref('');
            const searchOwnerFilter = ref('all'); // 'all', 'my', 'public'
            const searchDateRange = ref('all'); // 'all', 'today', 'week', 'month', 'year', 'custom'
            const searchDateStart = ref(''); // Custom date range start (YYYY-MM-DD)
            const searchDateEnd = ref(''); // Custom date range end (YYYY-MM-DD)

            // Cache for notes and books data
            let cachedNotes = [];
            let cachedBooks = [];

            const loadTagsAndData = async () => {
                try {
                    const [notes, books] = await Promise.all([
                        api.getAllNotesForTags(),
                        api.getBooks()
                    ]);
                    cachedNotes = notes;
                    cachedBooks = books;

                    // Build tag list
                    const tagSet = new Set();
                    notes.forEach(n => n.tags?.forEach(t => tagSet.add(t)));
                    books.forEach(b => b.tags?.forEach(t => tagSet.add(t)));
                    allTags.value = Array.from(tagSet).sort();
                } catch (e) {
                    console.error('[Search] Failed to load data:', e);
                }
            };

            const openSearchModal = async () => {
                showSearchModal.value = true;
                searchQuery.value = '';
                selectedTag.value = '';
                searchOwnerFilter.value = 'all';
                searchDateRange.value = 'all';
                searchDateStart.value = '';
                searchDateEnd.value = '';
                searchResults.value = { books: [], notes: [] };
                await loadTagsAndData();
                // Focus input after modal opens
                nextTick(() => {
                    searchInput.value?.focus();
                });
            };

            const toggleTag = (tag) => {
                selectedTag.value = selectedTag.value === tag ? '' : tag;
                performSearch();
            };

            // Helper: check if item is within date range
            const isWithinDateRange = (item) => {
                if (searchDateRange.value === 'all') return true;
                const itemDate = new Date(item.updatedAt || item.createdAt);
                const now = new Date();

                switch (searchDateRange.value) {
                    case 'today':
                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        return itemDate >= todayStart;
                    case 'week':
                        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        return itemDate >= weekAgo;
                    case 'month':
                        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        return itemDate >= monthAgo;
                    case 'year':
                        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                        return itemDate >= yearAgo;
                    case 'custom':
                        // Custom date range - if no dates set, treat as no filter
                        if (!searchDateStart.value && !searchDateEnd.value) return true;
                        if (searchDateStart.value) {
                            const startDate = new Date(searchDateStart.value);
                            startDate.setHours(0, 0, 0, 0);
                            if (itemDate < startDate) return false;
                        }
                        if (searchDateEnd.value) {
                            const endDate = new Date(searchDateEnd.value);
                            endDate.setHours(23, 59, 59, 999);
                            if (itemDate > endDate) return false;
                        }
                        return true;
                    default:
                        return true;
                }
            };

            // Helper: check if item matches owner filter
            const matchesOwnerFilter = (item) => {
                if (searchOwnerFilter.value === 'all') return true;
                if (searchOwnerFilter.value === 'my') return item.isOwner === true;
                if (searchOwnerFilter.value === 'public') return item.isPublic === true;
                return true;
            };

            // Debounced search function
            const performSearch = debounce(() => {
                const query = searchQuery.value.trim().toLowerCase();
                const tag = selectedTag.value;
                // Custom date range with no dates set is treated as no date filter
                const hasDateFilter = searchDateRange.value !== 'all' &&
                    !(searchDateRange.value === 'custom' && !searchDateStart.value && !searchDateEnd.value);
                const hasFilters = searchOwnerFilter.value !== 'all' || hasDateFilter;

                if (!query && !tag && !hasFilters) {
                    searchResults.value = { books: [], notes: [] };
                    return;
                }

                searchLoading.value = true;
                try {
                    // Filter based on search query, tag, owner, and date range
                    const matchingNotes = cachedNotes.filter(note => {
                        // Owner filter
                        if (!matchesOwnerFilter(note)) return false;
                        // Date range filter
                        if (!isWithinDateRange(note)) return false;
                        // Tag filter
                        if (tag && (!note.tags || !note.tags.includes(tag))) return false;
                        // Text search
                        if (!query) return true;
                        const titleMatch = (note.title || '').toLowerCase().includes(query);
                        const descMatch = (note.description || '').toLowerCase().includes(query);
                        if (includeContent.value) {
                            const contentMatch = (note.content || '').toLowerCase().includes(query);
                            return titleMatch || descMatch || contentMatch;
                        }
                        return titleMatch || descMatch;
                    });

                    const matchingBooks = cachedBooks.filter(book => {
                        // Owner filter
                        if (!matchesOwnerFilter(book)) return false;
                        // Date range filter
                        if (!isWithinDateRange(book)) return false;
                        // Tag filter
                        if (tag && (!book.tags || !book.tags.includes(tag))) return false;
                        // Text search
                        if (!query) return true;
                        const titleMatch = (book.title || '').toLowerCase().includes(query);
                        const descMatch = (book.description || '').toLowerCase().includes(query);
                        return titleMatch || descMatch;
                    });

                    searchResults.value = {
                        books: matchingBooks.slice(0, 20),
                        notes: matchingNotes.slice(0, 20)
                    };
                } catch (e) {
                    console.error('[Search] Failed:', e);
                } finally {
                    searchLoading.value = false;
                }
            }, 300);

            // Watch for search query changes
            watch(searchQuery, () => {
                performSearch();
            });

            watch(includeContent, () => {
                if (searchQuery.value.trim() || selectedTag.value || searchOwnerFilter.value !== 'all' || searchDateRange.value !== 'all') {
                    performSearch();
                }
            });

            watch(searchOwnerFilter, () => {
                performSearch();
            });

            watch(searchDateRange, () => {
                performSearch();
            });

            watch(searchDateStart, () => {
                if (searchDateRange.value === 'custom') {
                    performSearch();
                }
            });

            watch(searchDateEnd, () => {
                if (searchDateRange.value === 'custom') {
                    performSearch();
                }
            });

            onMounted(() => {
                updateThemeClass(theme.value);
                loadPinnedItems();
                loadAppVersion();
                loadSidebarBooks();
                // Listen for pin updates from other components
                window.addEventListener('pins-updated', loadPinnedItems);
                window.addEventListener('books-updated', loadSidebarBooks);

                // Check for search query param (from Note page redirect)
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('search') === '1') {
                    openSearchModal();
                    // Clean up URL
                    window.history.replaceState({}, '', '/');
                }
            });

            onUnmounted(() => {
                window.removeEventListener('pins-updated', loadPinnedItems);
                window.removeEventListener('books-updated', loadSidebarBooks);
            });

            return {
                showSettings, theme, setTheme, logout, exportingNotes, exportNotes,
                createNote,
                showCreateBookModal, newBookTitle, newBookDescription,
                // Create Book modal
                showCreateBookModal, newBookTitle, newBookDescription, openCreateBookModal, createBook, newBookTitleInput,
                // Profile modal
                showUserProfileModal, editableName, avatarPreview,
                openUserProfileModal, handleAvatarChange, removeAvatar, saveProfile, savingProfile,
                // Pinned items
                pinnedItems, unpinItem,
                // App version
                appVersion,
                // Search modal
                showSearchModal, searchQuery, includeContent, searchLoading, searchResults,
                searchInput, openSearchModal, allTags, selectedTag, toggleTag,
                searchOwnerFilter, searchDateRange, searchDateStart, searchDateEnd,
                // Sidebar books
                sidebarBooks, filteredSidebarBooks, limitedSidebarBooks, hasMoreBooks,
                // Global View Mode
                globalViewMode, setGlobalViewMode,
                // Current route for active state
                currentRoute,
                // Utilities
                dayjs
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

            const openNote = (note) => {
                window.location.href = '/n/' + note.id;
            };

            const openBook = (book) => {
                router.push('/b/' + book.id);
            };

            const notes = ref([]);
            const books = ref([]);
            const allNotesForTags = ref([]); // All notes including book notes, for tag collection
            const selectedTag = ref('');
            const searchQuery = ref('');
            const includeContent = ref(false);
            const notesViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my'); // 'my' or 'all' - synced with sidebar

            // Handler to sync with global view mode changes from sidebar
            const handleViewModeChanged = () => {
                notesViewMode.value = localStorage.getItem('NoteHubMD-viewMode') || 'my';
            };

            const notesDisplayMode = ref(localStorage.getItem('NoteHubMD-notesDisplayMode') || 'grid');
            const setNotesDisplayMode = (mode) => {
                notesDisplayMode.value = mode;
                localStorage.setItem('NoteHubMD-notesDisplayMode', mode);
            };
            const sortBy = ref('updatedAt'); // 'updatedAt', 'lastEditedAt', 'createdAt', 'title'
            const sortOrder = ref('desc'); // 'desc' or 'asc'

            // Sort options for UI
            const sortOptions = [
                { value: 'updatedAt', label: '最後更新時間' },
                { value: 'lastEditedAt', label: '最後編輯時間' },
                { value: 'createdAt', label: '建立時間' },
                { value: 'title', label: '標題' }
            ];

            // Pagination state
            const notesPerPage = ref(parseInt(localStorage.getItem('NoteHubMD-notesPerPage')) || 30);
            const currentNotesPage = ref(1);
            const perPageOptions = [30, 50];

            const setNotesPerPage = (count) => {
                notesPerPage.value = count;
                currentNotesPage.value = 1;
                localStorage.setItem('NoteHubMD-notesPerPage', count);
            };

            const goToNotesPage = (page) => {
                if (page >= 1 && page <= totalNotesPages.value) {
                    currentNotesPage.value = page;
                }
            };

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
            const infoModalTab = ref('info'); // 'info' or 'permission'
            const editableDescription = ref('');
            const editableTags = ref([]);
            const newTag = ref('');
            const infoCommentsEnabled = ref(true);

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

                // Apply ownership filter (my notes vs public notes)
                if (notesViewMode.value === 'my') {
                    result = result.filter(note => note.isOwner);
                } else {
                    // 'all' mode: only show items marked as public
                    result = result.filter(note => note.isPublic);
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

            // Pagination computed properties
            const totalNotesPages = computed(() => {
                return Math.ceil(filteredNotes.value.length / notesPerPage.value) || 1;
            });

            const paginatedNotes = computed(() => {
                const start = (currentNotesPage.value - 1) * notesPerPage.value;
                return filteredNotes.value.slice(start, start + notesPerPage.value);
            });

            // Reset page when filters change
            watch([selectedTag, searchQuery, notesViewMode, sortBy, sortOrder], () => {
                currentNotesPage.value = 1;
            });

            // Generate page numbers for display
            const notesPageNumbers = computed(() => {
                const total = totalNotesPages.value;
                const current = currentNotesPage.value;
                const pages = [];

                if (total <= 7) {
                    for (let i = 1; i <= total; i++) pages.push(i);
                } else {
                    pages.push(1);
                    if (current > 3) pages.push('...');

                    const start = Math.max(2, current - 1);
                    const end = Math.min(total - 1, current + 1);
                    for (let i = start; i <= end; i++) pages.push(i);

                    if (current < total - 2) pages.push('...');
                    pages.push(total);
                }
                return pages;
            });

            // Filter books by selected tag, search query, and ownership view mode
            // Include books that either: 1) have matching tag, OR 2) contain notes with matching tag
            const filteredBooks = computed(() => {
                let result = books.value;

                // Apply ownership filter (my items vs public items)
                if (notesViewMode.value === 'my') {
                    result = result.filter(book => book.isOwner);
                } else {
                    // 'all' mode: only show items marked as public
                    result = result.filter(book => book.isPublic);
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

                // Apply sorting and limit to 10 for display
                return sortItems(result).slice(0, 10);
            });

            // Check if there are more books beyond the displayed limit
            const hasMoreBooks = computed(() => {
                let result = books.value;

                // Apply ownership filter (my items vs public items)
                if (notesViewMode.value === 'my') {
                    result = result.filter(book => book.isOwner);
                } else {
                    // 'all' mode: only show items marked as public
                    result = result.filter(book => book.isPublic);
                }

                // Apply tag filter
                if (selectedTag.value) {
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

                return result.length > 10;
            });

            const selectTag = (tag) => {
                selectedTag.value = selectedTag.value === tag ? '' : tag;
            };

            const createNote = async () => {
                try {
                    const note = await api.createNote();
                    window.location.href = '/n/' + note.id;
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
                    router.push('/b/' + book.id);
                } catch (e) { globalModal.showAlert('Error creating book'); }
            };

            const deleteNote = async (id, event) => {
                if (event) event.stopPropagation();
                if (!await globalModal.showConfirm('確定要刪除此筆記？（可從垃圾桶還原）')) return;
                try {
                    await api.deleteNote(id);
                    notes.value = notes.value.filter(n => n.id !== id);
                } catch (e) { globalModal.showAlert('刪除失敗'); }
            };

            const deleteBook = async (id, event) => {
                if (event) event.stopPropagation();
                if (!await globalModal.showConfirm('確定要刪除此書本？（可從垃圾桶還原）')) return;
                try {
                    await api.deleteBook(id);
                    books.value = books.value.filter(b => b.id !== id);
                } catch (e) { globalModal.showAlert('刪除失敗'); }
            };

            // Move Note Modal state and functions
            const showMoveNoteModal = ref(false);
            const moveNoteTarget = ref(null);
            const selectedBookId = ref('');

            // Filter books that user can add notes to (owner or canEdit)
            const availableBooks = computed(() => {
                return books.value.filter(b => b.isOwner || b.canEdit);
            });

            const openMoveNoteModal = (note) => {
                moveNoteTarget.value = note;
                selectedBookId.value = note.bookId || '';
                showMoveNoteModal.value = true;
                openMenuId.value = null;
            };

            const moveNote = async () => {
                if (!moveNoteTarget.value) return;
                try {
                    // value '' means "no book" (null in db)
                    const bookId = selectedBookId.value || null;
                    const oldBookId = moveNoteTarget.value.bookId;

                    if (bookId === oldBookId) {
                        showMoveNoteModal.value = false;
                        return;
                    }

                    await api.updateNote(moveNoteTarget.value.id, { bookId });

                    // Update local list
                    const note = notes.value.find(n => n.id === moveNoteTarget.value.id);
                    if (note) {
                        note.bookId = bookId;
                    }
                    // Also update in allNotesForTags
                    const allNoteIndex = allNotesForTags.value.findIndex(n => n.id === moveNoteTarget.value.id);
                    if (allNoteIndex !== -1) {
                        allNotesForTags.value[allNoteIndex].bookId = bookId;
                    }

                    // Update local books count (for Home page cards)
                    if (oldBookId) {
                        const oldBook = books.value.find(b => b.id === oldBookId);
                        if (oldBook) {
                            oldBook.noteCount = Math.max(0, (oldBook.noteCount || 0) - 1);
                        }
                    }
                    if (bookId) {
                        const newBook = books.value.find(b => b.id === bookId);
                        if (newBook) {
                            newBook.noteCount = (newBook.noteCount || 0) + 1;
                        }
                    }

                    // Notify other components (Sidebar) for refresh
                    window.dispatchEvent(new Event('books-updated'));

                    showMoveNoteModal.value = false;
                    globalModal.showAlert('移動成功', { type: 'success' });
                } catch (e) {
                    console.error(e);
                    globalModal.showAlert('移動失敗: ' + e.message);
                }
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

            const openInfoModal = (type, item, tab = 'info') => {
                infoModalType.value = type;
                infoModalItem.value = { ...item };
                editableDescription.value = item.description || '';
                editableTags.value = [...(item.tags || [])];
                editablePermission.value = item.permission || 'private';
                infoCommentsEnabled.value = !item.commentsDisabled;
                infoModalTab.value = tab;
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

                    // Add isPublic to updateData if owner
                    if (infoModalItem.value.isOwner) {
                        updateData.isPublic = infoModalItem.value.isPublic;
                    }

                    if (infoModalType.value === 'book') {
                        updateData.description = editableDescription.value;
                        // Add title if book and changed
                        if (infoModalItem.value.canEdit && infoModalItem.value.title) {
                            updateData.title = infoModalItem.value.title;
                        }
                        await api.updateBook(infoModalItem.value.id, updateData);
                        // Update local book data
                        const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id);
                        if (bookIndex !== -1) {
                            books.value[bookIndex].tags = [...editableTags.value];
                            books.value[bookIndex].description = editableDescription.value;
                            books.value[bookIndex].permission = editablePermission.value;
                            books.value[bookIndex].isPublic = infoModalItem.value.isPublic;
                            if (infoModalItem.value.canEdit && infoModalItem.value.title) {
                                books.value[bookIndex].title = infoModalItem.value.title;
                            }
                        }
                    } else {
                        updateData.commentsDisabled = !infoCommentsEnabled.value;
                        await api.updateNote(infoModalItem.value.id, updateData);
                        // Update local note data
                        const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id);
                        if (noteIndex !== -1) {
                            notes.value[noteIndex].tags = [...editableTags.value];
                            notes.value[noteIndex].permission = editablePermission.value;
                            notes.value[noteIndex].commentsDisabled = !infoCommentsEnabled.value;
                            notes.value[noteIndex].isPublic = infoModalItem.value.isPublic;
                        }
                        // Also update in allNotesForTags
                        const allNoteIndex = allNotesForTags.value.findIndex(n => n.id === infoModalItem.value.id);
                        if (allNoteIndex !== -1) {
                            allNotesForTags.value[allNoteIndex].tags = [...editableTags.value];
                            allNotesForTags.value[allNoteIndex].isPublic = infoModalItem.value.isPublic;
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
                // Listen for view mode changes from sidebar
                window.addEventListener('viewmode-changed', handleViewModeChanged);
            });

            onUnmounted(() => {
                document.removeEventListener('click', closeMenu);
                window.removeEventListener('viewmode-changed', handleViewModeChanged);
            });

            const handleMoveNoteFromInfo = async (targetBookId) => {
                moveNoteTarget.value = infoModalItem.value;
                selectedBookId.value = targetBookId;
                await moveNote();
                if (showInfoModal.value) {
                    // Refresh info modal item if needed, but moveNote might update it?
                    // Usually moveNote updates the note in note list.
                    // infoModalItem.value refers to the object in the list.
                    // So update should reflect.
                    // But wait, moveNote re-fetches or splices?
                    // If note is moved to another book, does it stay in view?
                    // Depends on view mode.
                }
                // We don't necessarily close info modal if user wants to keep editing?
                // But the user clicked "Move". Usually implies done?
                // Move modal closes.
                // Info modal "Move" button.
                // Let's close it to be safe/clear.
                showInfoModal.value = false;
            };

            return {
                notes, books, createNote, createBook, deleteNote, deleteBook,
                openNote, openBook,
                allTags, selectedTag, filteredNotes, filteredBooks, hasMoreBooks, selectTag,
                searchQuery, includeContent, notesViewMode, notesDisplayMode, setNotesDisplayMode,
                // Pagination
                paginatedNotes, notesPerPage, currentNotesPage, totalNotesPages, perPageOptions,
                notesPageNumbers, setNotesPerPage, goToNotesPage,
                // Move Note
                showMoveNoteModal, moveNoteTarget, selectedBookId, availableBooks, openMoveNoteModal, moveNote,
                handleMoveNoteFromInfo,
                sortBy, sortOrder, sortOptions,
                openMenuId, toggleMenu, closeMenu,
                showInfoModal, infoModalType, infoModalItem, infoModalTab,
                editableDescription, editableTags, newTag, editablePermission, infoCommentsEnabled,
                openInfoModal, addEditableTag, removeEditableTag, saveInfoChanges, getPermissionLabel,
                showCreateBookModal, newBookTitle, newBookDescription, openCreateBookModal,
                // User permissions for info modal
                infoUserPermissions, infoUserSearchQuery, infoUserSearchResults, infoNewUserPermission,
                infoLoadingUserPermissions, infoSearchUsers, addInfoUserPermission,
                removeInfoUserPermission, updateInfoUserPermissionLevel,
                // Pinned items
                pinnedItems, isPinned, togglePin,
                // Utilities
                dayjs
            };
        }
    };


    const Book = {
        template: '#book-template',
        setup() {
            const route = useRoute();
            const router = VueRouter.useRouter();
            const openNote = (note) => {
                window.location.href = '/n/' + note.id;
            };
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
            const infoModalTab = ref('info');

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
                    } else if (e.message.includes('not found') || e.message.includes('Not found')) {
                        // Book doesn't exist - redirect to 404
                        window.location.href = '/404';
                        return;
                    }
                    globalModal.showAlert('載入書本失敗');
                    router.push('/');
                }
            };

            const createNote = async () => {
                try {
                    const note = await api.createNoteInBook(book.value.id);
                    window.location.href = '/n/' + note.id;
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
                    const updateData = {
                        description: editableDescription.value,
                        tags: editableTags.value
                    };
                    // Add title if changed
                    if (bookInfoItem.value.canEdit && bookInfoItem.value.title) {
                        updateData.title = bookInfoItem.value.title;
                    }
                    // Add isPublic if owner
                    if (isOwner.value) {
                        updateData.isPublic = book.value.isPublic;
                    }
                    await api.updateBook(book.value.id, updateData);
                    book.value.description = editableDescription.value;
                    book.value.tags = [...editableTags.value];
                    // Update book title locally
                    if (bookInfoItem.value.canEdit && bookInfoItem.value.title) {
                        book.value.title = bookInfoItem.value.title;
                    }
                    showInfoModal.value = false;
                } catch (e) { globalModal.showAlert('儲存失敗'); }
            };

            onMounted(loadBook);

            // Watch for route parameter changes to reload book when navigating between books
            watch(() => route.params.id, (newId, oldId) => {
                if (newId && newId !== oldId) {
                    loadBook();
                }
            });

            onUnmounted(() => {
                if (sortableInstance) {
                    sortableInstance.destroy();
                    sortableInstance = null;
                }
            });

            // Computed book info item for InfoModal
            const bookInfoItem = computed(() => ({
                id: book.value.id,
                title: book.value.title,
                owner: book.value.owner,
                lastUpdater: book.value.lastUpdater,
                createdAt: book.value.createdAt,
                updatedAt: book.value.updatedAt,
                permission: permission.value,
                isOwner: isOwner.value,
                canEdit: canEdit.value,
                isPublic: book.value.isPublic || false
            }));

            return {
                book, createNote, openNote,
                editableDescription, editableTags, newTag, editablePermission,
                addEditableTag, removeEditableTag, saveBookChanges, initInfoModal,
                permission, isOwner, canEdit, canAddNote,
                permissionOptions, handlePermissionChange,
                notesList,
                // Info modal
                showInfoModal, infoModalTab, bookInfoItem,
                infoUserPermissions, infoUserSearchQuery, infoUserSearchResults, infoNewUserPermission,
                infoLoadingUserPermissions, infoSearchUsers, addInfoUserPermission,
                removeInfoUserPermission, updateInfoUserPermissionLevel
            };
        }
    };


    const Uncategorized = {
        template: '#uncategorized-template',
        setup() {
            const router = VueRouter.useRouter();
            const openNote = (note) => {
                window.location.href = '/n/' + note.id;
            };
            const notes = ref([]);
            const books = ref([]);
            const loading = ref(true);

            // View mode sync with sidebar
            const viewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my');

            const handleViewModeChanged = () => {
                viewMode.value = localStorage.getItem('NoteHubMD-viewMode') || 'my';
            };

            const displayMode = ref(localStorage.getItem('NoteHubMD-notesDisplayMode') || 'grid');
            const setDisplayMode = (mode) => {
                displayMode.value = mode;
                localStorage.setItem('NoteHubMD-notesDisplayMode', mode);
            };

            // Sort state
            const sortBy = ref('updatedAt'); // 'updatedAt', 'lastEditedAt', 'createdAt', 'title'
            const sortOrder = ref('desc'); // 'desc' or 'asc'

            // Sort options for UI
            const sortOptions = [
                { value: 'updatedAt', label: '更新時間' },
                { value: 'lastEditedAt', label: '內文編輯時間' },
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

            // Filtered notes based on view mode
            const filteredNotes = computed(() => {
                let result = notes.value;
                if (viewMode.value === 'my') {
                    result = result.filter(note => note.isOwner);
                } else {
                    result = result.filter(note => note.isPublic);
                }
                return result;
            });

            // Computed sorted notes (applies to filtered notes)
            const sortedNotes = computed(() => sortItems(filteredNotes.value));

            // Available books for move modal
            const availableBooks = ref([]);

            // ========== Move Note Modal ==========
            const showMoveNoteModal = ref(false);
            const moveNoteTarget = ref(null);
            const selectedBookId = ref('');

            const loadNotes = async () => {
                loading.value = true;
                try {
                    // Fetch all notes (limit 1000 to be safe for uncategorized view)
                    // We don't filter by bookId=null on server yet because we need to support Move Note which might need book info?
                    // Actually, for Uncategorized view, we only need notes where bookId is null.
                    // But current API implementation for /notes filters purely by bookId unless includeBookNotes=true.
                    // So calling getNotes() without includeBookNotes defaults to bookId: null (standalone notes).
                    // We just increase the limit to ensure we get all of them.
                    const fetchedNotes = await api.getNotes({ limit: 1000 });
                    notes.value = fetchedNotes;

                    // Load pinned items
                    await loadPinnedItems();

                } catch (e) {
                    console.error('Failed to load notes', e);
                    globalModal.showAlert('無法載入筆記');
                } finally {
                    loading.value = false;
                }
            };

            // Load books only when needed (for Move Note modal)
            const loadBooksForMove = async () => {
                if (availableBooks.value.length > 0) return; // Already loaded
                try {
                    const books = await api.getBooks();
                    availableBooks.value = books;
                } catch (e) {
                    console.error('Failed to load books', e);
                }
            };

            // Call this when opening move modal
            watch(showMoveNoteModal, (newVal) => {
                if (newVal) {
                    loadBooksForMove();
                }
            });

            // Also call when opening info modal (as it might have move option or just for consistent data if needed later)
            // Actually, independent Move Modal handles books now. Info modal might not need books unless we add move there back.
            // But we kept handleMoveNoteFromInfo just in case, so maybe safe to load.
            // For now let's just load when needed.
            const deleteNote = async (noteId) => {
                const confirmed = await globalModal.showConfirm('確定要將此筆記移至垃圾桶？');
                if (!confirmed) return;
                try {
                    await api.deleteNote(noteId);
                    notes.value = notes.value.filter(n => n.id !== noteId);
                } catch (e) {
                    globalModal.showAlert('刪除失敗');
                }
            };

            // Menu state for dropdown
            const openMenuId = ref(null);
            const toggleMenu = (noteId) => {
                openMenuId.value = openMenuId.value === noteId ? null : noteId;
            };
            const closeMenu = () => {
                openMenuId.value = null;
            };

            // Close menu when clicking outside
            const handleClickOutside = (event) => {
                if (openMenuId.value && !event.target.closest('.relative')) {
                    closeMenu();
                }
            };

            // ========== Pinned Items ==========
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
                        await loadPinnedItems();
                    }
                    openMenuId.value = null;
                    window.dispatchEvent(new Event('pins-updated'));
                } catch (e) {
                    globalModal.showAlert('操作失敗: ' + e.message);
                }
            };

            // ========== Info Modal ==========
            const showInfoModal = ref(false);
            const infoModalItem = ref({});
            const infoModalTab = ref('info');
            const editablePermission = ref('private');
            const infoCommentsEnabled = ref(true);

            // User permissions state
            const userPermissions = ref([]);
            const loadingUserPermissions = ref(false);
            const userSearchQuery = ref('');
            const userSearchResults = ref([]);
            const newUserPermission = ref('view');

            const openInfoModal = (note) => {
                infoModalItem.value = { ...note };
                editablePermission.value = note.permission || 'private';
                infoCommentsEnabled.value = !note.commentsDisabled;
                infoModalTab.value = 'info';
                showInfoModal.value = true;
                openMenuId.value = null;
                loadUserPermissions();
            };

            const loadUserPermissions = async () => {
                if (!infoModalItem.value?.isOwner) return;
                loadingUserPermissions.value = true;
                try {
                    userPermissions.value = await api.getNoteUserPermissions(infoModalItem.value.id);
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
                    userSearchResults.value = results.filter(u =>
                        u.id !== infoModalItem.value?.owner?.id &&
                        !userPermissions.value.find(p => p.userId === u.id)
                    );
                } catch (e) {
                    console.error('Failed to search users', e);
                }
            }, 300);

            const addUserPermission = async (user) => {
                try {
                    await api.addNoteUserPermission(infoModalItem.value.id, user.id, newUserPermission.value);
                    await loadUserPermissions();
                    userSearchQuery.value = '';
                    userSearchResults.value = [];
                } catch (e) {
                    globalModal.showAlert('新增失敗：' + e.message);
                }
            };

            const removeUserPermission = async (userId) => {
                try {
                    await api.removeNoteUserPermission(infoModalItem.value.id, userId);
                    userPermissions.value = userPermissions.value.filter(p => p.userId !== userId);
                } catch (e) {
                    globalModal.showAlert('移除失敗：' + e.message);
                }
            };

            const updateUserPermissionLevel = async (perm, newLevel) => {
                try {
                    await api.addNoteUserPermission(infoModalItem.value.id, perm.userId, newLevel);
                    perm.permission = newLevel;
                } catch (e) {
                    globalModal.showAlert('更新失敗：' + e.message);
                }
            };

            const saveInfoChanges = async () => {
                try {
                    const updateData = {
                        commentsDisabled: !infoCommentsEnabled.value,
                        isPublic: infoModalItem.value.isPublic
                    };

                    if (infoModalItem.value.isOwner && editablePermission.value !== infoModalItem.value.permission) {
                        await api.updatePermission(infoModalItem.value.id, editablePermission.value);
                    }

                    await api.updateNote(infoModalItem.value.id, updateData);

                    // Update local note data
                    const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id);
                    if (noteIndex !== -1) {
                        notes.value[noteIndex].permission = editablePermission.value;
                        notes.value[noteIndex].commentsDisabled = !infoCommentsEnabled.value;
                        notes.value[noteIndex].isPublic = infoModalItem.value.isPublic;
                    }

                    showInfoModal.value = false;
                } catch (e) {
                    globalModal.showAlert('儲存失敗');
                }
            };

            // [Moved to top to prevent ReferenceError]

            const openMoveNoteModal = (note) => {
                moveNoteTarget.value = note;
                selectedBookId.value = note.bookId || '';
                showMoveNoteModal.value = true;
                openMenuId.value = null;
            };

            const moveNote = async () => {
                if (!moveNoteTarget.value) return;
                try {
                    const bookId = selectedBookId.value || null;
                    await api.updateNote(moveNoteTarget.value.id, { bookId });
                    // Note is being moved to a book, so remove from uncategorized list
                    if (bookId) {
                        notes.value = notes.value.filter(n => n.id !== moveNoteTarget.value.id);
                    }
                    showMoveNoteModal.value = false;
                    globalModal.showAlert('移動成功', { type: 'success' });
                } catch (e) {
                    globalModal.showAlert('移動失敗: ' + e.message);
                }
            };

            // Handle move from info modal
            const handleMoveNoteFromInfo = async (targetBookId) => {
                try {
                    await api.updateNote(infoModalItem.value.id, { bookId: targetBookId || null });
                    if (targetBookId) {
                        notes.value = notes.value.filter(n => n.id !== infoModalItem.value.id);
                    }
                    showInfoModal.value = false;
                    globalModal.showAlert('移動成功', { type: 'success' });
                } catch (e) {
                    globalModal.showAlert('移動失敗: ' + e.message);
                }
            };

            onMounted(() => {
                loadNotes();
                window.addEventListener('viewmode-changed', handleViewModeChanged);
                document.addEventListener('click', handleClickOutside);
            });

            onUnmounted(() => {
                window.removeEventListener('viewmode-changed', handleViewModeChanged);
                document.removeEventListener('click', handleClickOutside);
            });

            return {
                notes, sortedNotes, loading, deleteNote, dayjs, sortBy, sortOrder, sortOptions,
                displayMode, setDisplayMode, openMenuId, toggleMenu, openNote,
                // Pinned
                pinnedItems, isPinned, togglePin,
                // Info Modal
                showInfoModal, infoModalItem, infoModalTab, editablePermission, infoCommentsEnabled,
                userPermissions, loadingUserPermissions, userSearchQuery, userSearchResults, newUserPermission,
                openInfoModal, searchUsers, addUserPermission, removeUserPermission, updateUserPermissionLevel,
                saveInfoChanges, handleMoveNoteFromInfo,
                // Move Note Modal
                showMoveNoteModal, moveNoteTarget, selectedBookId, availableBooks, openMoveNoteModal, moveNote
            };
        }
    };

    // All Books Component - shows all books

    const AllBooks = {
        template: '#allbooks-template',
        setup() {
            const router = VueRouter.useRouter();
            const openBook = (book) => {
                router.push('/b/' + book.id);
            };
            const books = ref([]);
            const loading = ref(true);

            // View mode sync with sidebar
            const viewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my');

            const handleViewModeChanged = () => {
                viewMode.value = localStorage.getItem('NoteHubMD-viewMode') || 'my';
            };

            // Sort state
            const sortBy = ref('updatedAt'); // 'updatedAt', 'createdAt', 'title'
            const sortOrder = ref('desc'); // 'desc' or 'asc'

            // Sort options for UI
            const sortOptions = [
                { value: 'updatedAt', label: '更新時間' },
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

            // Filtered books based on view mode
            const filteredBooks = computed(() => {
                let result = books.value;
                if (viewMode.value === 'my') {
                    result = result.filter(book => book.isOwner);
                } else {
                    result = result.filter(book => book.isPublic);
                }
                return result;
            });

            // Computed sorted books
            const sortedBooks = computed(() => sortItems(filteredBooks.value));

            // Menu state
            const openMenuId = ref(null);

            const toggleMenu = (id) => {
                openMenuId.value = openMenuId.value === id ? null : id;
            };

            const closeMenu = () => {
                openMenuId.value = null;
            };

            // Pinned items state
            const pinnedItems = ref([]);

            const loadPinnedItems = async () => {
                try {
                    pinnedItems.value = await api.getPinnedItems();
                } catch (e) {
                    console.error('Failed to load pinned items:', e);
                }
            };

            const isPinned = (id) => {
                return pinnedItems.value.some(p => p.type === 'book' && p.id === id);
            };

            const togglePin = async (id) => {
                try {
                    if (isPinned(id)) {
                        await api.removePin('book', id);
                        pinnedItems.value = pinnedItems.value.filter(p => !(p.type === 'book' && p.id === id));
                    } else {
                        await api.addPin('book', id);
                        await loadPinnedItems();
                    }
                    openMenuId.value = null;
                    window.dispatchEvent(new Event('pins-updated'));
                } catch (e) {
                    globalModal.showAlert('操作失敗: ' + e.message);
                }
            };

            const loadBooks = async () => {
                loading.value = true;
                try {
                    books.value = await api.getBooks();
                    await loadPinnedItems();
                } catch (e) {
                    console.error('[AllBooks] Failed to load books:', e);
                } finally {
                    loading.value = false;
                }
            };

            const deleteBook = async (bookId) => {
                const confirmed = await globalModal.showConfirm('確定要將此書本移至垃圾桶？');
                if (!confirmed) return;
                try {
                    await api.deleteBook(bookId);
                    books.value = books.value.filter(b => b.id !== bookId);
                    window.dispatchEvent(new Event('books-updated'));
                } catch (e) {
                    globalModal.showAlert('刪除失敗');
                }
            };

            onMounted(() => {
                loadBooks();
                window.addEventListener('viewmode-changed', handleViewModeChanged);
                document.addEventListener('click', closeMenu);
            });

            onUnmounted(() => {
                window.removeEventListener('viewmode-changed', handleViewModeChanged);
                document.removeEventListener('click', closeMenu);
            });

            return {
                books, sortedBooks, loading,
                dayjs, sortBy, sortOrder, sortOptions,
                openMenuId, toggleMenu,
                isPinned, togglePin, deleteBook, openBook
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




    // Routes for Home pages (Note and Login are separate pages)
    const routes = [
        {
            path: '/',
            component: Layout,
            children: [
                { path: '', component: Home },
                { path: 'b/:id', component: Book },
                { path: 'books', component: AllBooks },
                { path: 'uncategorized', component: Uncategorized },
                { path: 'trash', component: Trash },
                { path: 'admin', component: Admin },
            ]
        }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes,
    });

    // Global Auth Guard
    router.beforeEach(async (to, from, next) => {
        try {
            await api.getMe();
            next();
        } catch (e) {
            // Save the original path and redirect to login
            window.location.href = '/login?redirect=' + encodeURIComponent(to.fullPath);
        }
    });

    // Create Vue App
    const app = createApp({
        setup() {
            // Modal state
            const modal = reactive({
                show: false,
                type: 'alert',
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

    // Register global components
    app.component('Sidebar', Sidebar);
    app.component('InfoModal', InfoModal);
    app.component('BookCard', BookCard);
    app.component('NoteCard', NoteCard);
    app.component('SidebarNav', SidebarNav);

    app.use(router);

    // Mount app and get the instance
    const vm = app.mount('#app');

    // Set app instance for global modal
    setAppInstance(vm);
})();
