/**
 * NoteHubMD Components - Shared Vue Components
 * Components: InfoModal, BookCard, NoteCard, SidebarNav
 */

// Use IIFE to avoid polluting global scope with variable declarations
(function () {
    // Get dependencies from common.js
    const { ref, computed, watch, nextTick } = window.NoteHubMD.Vue;
    const { api, debounce } = window.NoteHubMD;

    // Shared Info Modal Component
    const InfoModal = {
        template: '#info-modal-template',
        props: {
            show: Boolean,
            type: String, // 'book' or 'note'
            item: Object,
            tab: { type: String, default: 'info' },
            editableDescription: String,
            editableTags: Array,
            newTagInput: String,
            editablePermission: String,
            commentsEnabled: Boolean,
            userPermissions: Array,
            loadingUserPermissions: Boolean,
            userSearchQuery: String,
            userSearchResults: Array,
            newUserPermission: { type: String, default: 'view' },
            books: { type: Array, default: () => [] }
        },
        emits: [
            'close', 'save', 'update:tab', 'update:description', 'update:permission',
            'update:commentsEnabled', 'update:newTag', 'update:newUserPermission',
            'update:isPublic', 'add-tag', 'remove-tag', 'search-users', 'add-user-permission',
            'remove-user-permission', 'update-user-permission', 'move-note'
        ],
        setup(props, { emit }) {
            const formatDate = (dateStr) => {
                if (!dateStr) return '(無)';
                return dayjs(dateStr).format('YYYY/MM/DD HH:mm');
            };

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

            const selectedMoveBookId = ref('');

            watch(() => props.item, (newItem) => {
                if (newItem && props.type === 'note') {
                    selectedMoveBookId.value = newItem.bookId || '';
                }
            }, { immediate: true });

            const moveNote = () => {
                emit('move-note', selectedMoveBookId.value || null);
            };

            return {
                formatDate,
                getPermissionLabel,
                selectedMoveBookId,
                moveNote
            };
        }
    };

    // Book Card Component
    const BookCard = {
        template: '#book-card-template',
        props: {
            book: { type: Object, required: true },
            showMenu: { type: Boolean, default: false },
            isPinned: { type: Boolean, default: false }
        },
        emits: ['toggle-menu', 'open-info', 'toggle-pin', 'delete', 'click'],
        setup(props) {
            const menuButton = ref(null);

            const menuStyle = computed(() => {
                if (!menuButton.value || !props.showMenu) return {};
                const rect = menuButton.value.getBoundingClientRect();
                return {
                    top: `${rect.bottom + 4}px`,
                    left: `${rect.right - 144}px` // 144px = menu width (w-36 = 9rem = 144px)
                };
            });

            return { dayjs, menuButton, menuStyle };
        }
    };

    // Note Card Component
    const NoteCard = {
        template: '#note-card-template',
        props: {
            note: { type: Object, required: true },
            mode: { type: String, default: 'grid' }, // 'grid' or 'list'
            showMenu: { type: Boolean, default: false },
            isPinned: { type: Boolean, default: false },
            showMoveOption: { type: Boolean, default: true } // Show move to book option
        },
        emits: ['toggle-menu', 'open-info', 'toggle-pin', 'open-move', 'delete', 'click'],
        setup() {
            return { dayjs };
        }
    };

    // Shared Sidebar Navigation Component (self-contained with search modal)
    const SidebarNav = {
        template: '#sidebar-nav-template',
        props: {
            user: { type: Object, default: null },
            books: { type: Array, default: () => [] },
            pinnedItems: { type: Array, default: () => [] },
            showPinned: { type: Boolean, default: true },
            showMoreBooks: { type: Boolean, default: false },
            currentRoute: { type: String, default: '/' },
            globalViewMode: { type: String, default: 'my' },
            appVersion: { type: String, default: '' }
        },
        emits: ['unpin', 'view-mode-change', 'create-note', 'create-book', 'open-profile', 'open-settings'],
        setup() {
            // Search Modal state and functions
            const showSearchModal = ref(false);
            const searchQuery = ref('');
            const includeContent = ref(false);
            const searchLoading = ref(false);
            const searchResults = ref({ books: [], notes: [] });
            const searchInput = ref(null);
            const allTags = ref([]);
            const selectedTag = ref('');
            const searchOwnerFilter = ref('all');
            const searchDateRange = ref('all');
            const searchDateStart = ref('');
            const searchDateEnd = ref('');

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

                    const tagSet = new Set();
                    notes.forEach(n => n.tags?.forEach(t => tagSet.add(t)));
                    books.forEach(b => b.tags?.forEach(t => tagSet.add(t)));
                    allTags.value = Array.from(tagSet).sort();
                } catch (e) {
                    console.error('[SidebarNav] Failed to load data:', e);
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
                nextTick(() => {
                    searchInput.value?.focus();
                });
            };

            const toggleTag = (tag) => {
                selectedTag.value = selectedTag.value === tag ? '' : tag;
                performSearch();
            };

            const isWithinDateRange = (item) => {
                if (searchDateRange.value === 'all') return true;
                const itemDate = new Date(item.updatedAt || item.createdAt);
                const now = new Date();

                switch (searchDateRange.value) {
                    case 'today':
                        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        return itemDate >= todayStart;
                    case 'week':
                        return itemDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    case 'month':
                        return itemDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    case 'year':
                        return itemDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    case 'custom':
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

            const matchesOwnerFilter = (item) => {
                if (searchOwnerFilter.value === 'all') return true;
                if (searchOwnerFilter.value === 'my') return item.isOwner === true;
                if (searchOwnerFilter.value === 'public') return item.isPublic === true;
                return true;
            };

            const performSearch = debounce(() => {
                const query = searchQuery.value.trim().toLowerCase();
                const tag = selectedTag.value;
                const hasDateFilter = searchDateRange.value !== 'all' &&
                    !(searchDateRange.value === 'custom' && !searchDateStart.value && !searchDateEnd.value);
                const hasFilters = searchOwnerFilter.value !== 'all' || hasDateFilter;

                if (!query && !tag && !hasFilters) {
                    searchResults.value = { books: [], notes: [] };
                    return;
                }

                searchLoading.value = true;
                try {
                    const matchingNotes = cachedNotes.filter(note => {
                        if (!matchesOwnerFilter(note)) return false;
                        if (!isWithinDateRange(note)) return false;
                        if (tag && (!note.tags || !note.tags.includes(tag))) return false;
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
                        if (!matchesOwnerFilter(book)) return false;
                        if (!isWithinDateRange(book)) return false;
                        if (tag && (!book.tags || !book.tags.includes(tag))) return false;
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
                    console.error('[SidebarNav] Search failed:', e);
                } finally {
                    searchLoading.value = false;
                }
            }, 300);

            // Watches for search
            watch(searchQuery, () => performSearch());
            watch(includeContent, () => {
                if (searchQuery.value.trim() || selectedTag.value || searchOwnerFilter.value !== 'all' || searchDateRange.value !== 'all') {
                    performSearch();
                }
            });
            watch(searchOwnerFilter, () => performSearch());
            watch(searchDateRange, () => performSearch());
            watch(searchDateStart, () => { if (searchDateRange.value === 'custom') performSearch(); });
            watch(searchDateEnd, () => { if (searchDateRange.value === 'custom') performSearch(); });

            return {
                // Search modal
                showSearchModal, searchQuery, includeContent, searchLoading, searchResults,
                searchInput, openSearchModal, allTags, selectedTag, toggleTag,
                searchOwnerFilter, searchDateRange, searchDateStart, searchDateEnd,
                // Utilities
                dayjs
            };
        }
    };

    // Export to global namespace
    window.NoteHubMD = Object.assign(window.NoteHubMD, {
        components: {
            InfoModal,
            BookCard,
            NoteCard,
            SidebarNav
        }
    });
})();
