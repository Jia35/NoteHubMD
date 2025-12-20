/**
 * NoteHubMD Note Page Script
 * Handles note editor functionality with real-time collaboration
 */

// Use IIFE to avoid polluting global scope
(function () {
    // Get dependencies from common.js
    const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } = window.NoteHubMD.Vue;
    const { createRouter, createWebHistory, useRoute } = window.NoteHubMD.VueRouter;
    const { socket, api, globalModal, setAppInstance, debounce, extractTags, compressImage } = window.NoteHubMD;

    // Get components from components.js
    const { SidebarNav, InfoModal } = window.NoteHubMD.components;

    const Note = {
        template: '#note-template',
        components: { SidebarNav },
        setup() {
            const route = useRoute();
            const router = VueRouter.useRouter();
            const noteId = computed(() => route.params.id);
            const currentRoute = computed(() => route.path);

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
            const noteIsPublic = ref(false); // Track if note is marked as public

            // Editor statistics
            const charCount = computed(() => content.value.length);
            const lineCount = computed(() => content.value.split('\n').length);
            const selectedLines = ref(0);
            const selectedChars = ref(0);

            // Note metadata for preview info bar
            const noteOwner = ref(null);
            const lastEditor = ref(null);
            const lastUpdater = ref(null);
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

            // Sidebar Books list
            const sidebarBooks = ref([]);
            const loadSidebarBooks = async () => {
                try {
                    sidebarBooks.value = await api.getBooks();
                } catch (e) {
                    console.error('[Note] Failed to load books:', e);
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

            // Sidebar Pinned items
            const pinnedItems = ref([]);
            const loadPinnedItems = async () => {
                try {
                    pinnedItems.value = await api.getPinnedItems();
                } catch (e) {
                    console.error('[Note] Failed to load pinned items:', e);
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

            // Global View Mode (persisted in localStorage)
            const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my');
            const setGlobalViewMode = (mode) => {
                globalViewMode.value = mode;
                localStorage.setItem('NoteHubMD-viewMode', mode);
                window.dispatchEvent(new Event('viewmode-changed'));
            };

            // Search Modal - redirect to home page with search
            const openSearchModal = () => {
                // Navigate to home page which has the full search modal
                window.location.href = '/?search=1';
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

            // Save note settings (commentsDisabled toggle & isPublic)
            const saveNoteSettings = async () => {
                try {
                    const updateData = {
                        commentsDisabled: !noteCommentsEnabled.value
                    };
                    // Add isPublic if owner
                    if (isOwner.value) {
                        updateData.isPublic = noteIsPublic.value;
                    }
                    await api.updateNote(noteId.value, updateData);
                    showNoteInfoModal.value = false;
                } catch (e) {
                    globalModal.showAlert('儲存失敗：' + e.message);
                }
            };

            // Share modal state
            const showShareModal = ref(false);
            const shareUrl = ref('');
            const shareCopied = ref(false);

            // Share note - generate share link and show modal
            const shareNote = async () => {
                try {
                    const response = await fetch(`/api/notes/${noteId.value}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || 'Failed to generate share link');
                    }

                    const result = await response.json();
                    shareUrl.value = window.location.origin + result.shareUrl;
                    shareCopied.value = false;
                    showShareModal.value = true;

                    // Load alias status when modal opens
                    loadNoteAlias();
                } catch (e) {
                    globalModal.showAlert('分享失敗：' + e.message);
                }
            };

            // Copy share link to clipboard
            const copyShareLink = async () => {
                try {
                    await navigator.clipboard.writeText(shareUrl.value);
                    shareCopied.value = true;
                    setTimeout(() => {
                        shareCopied.value = false;
                    }, 2000);
                } catch (e) {
                    globalModal.showAlert('複製失敗：' + e.message);
                }
            };

            // Open share page in new tab
            const openSharePage = () => {
                window.open(shareUrl.value, '_blank');
            };

            // Reset share link
            const resetShareLink = async () => {
                if (!await globalModal.showConfirm('重設後，原有的分享連結將失效。確定要重設嗎？')) {
                    return;
                }
                try {
                    const response = await fetch(`/api/notes/${noteId.value}/share`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || 'Failed to reset share link');
                    }

                    const result = await response.json();
                    shareUrl.value = window.location.origin + result.shareUrl;
                    shareCopied.value = false;
                    globalModal.showAlert('分享連結已重設！', { type: 'success' });
                } catch (e) {
                    globalModal.showAlert('重設失敗：' + e.message);
                }
            };


            // Alias state for share modal
            const aliasEnabled = ref(false);
            const aliasInput = ref('');
            const currentAlias = ref('');
            const aliasError = ref('');
            const aliasSaving = ref(false);

            // Toggle alias on/off
            const toggleAlias = async () => {
                if (aliasEnabled.value) {
                    // Turning off - clear the alias
                    aliasSaving.value = true;
                    try {
                        const response = await fetch(`/api/notes/${noteId.value}/alias`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ alias: '' })
                        });
                        if (!response.ok) {
                            const data = await response.json();
                            throw new Error(data.error);
                        }
                        aliasEnabled.value = false;
                        aliasInput.value = '';
                        currentAlias.value = '';
                        aliasError.value = '';
                    } catch (e) {
                        globalModal.showAlert('清除別名失敗：' + e.message);
                    } finally {
                        aliasSaving.value = false;
                    }
                } else {
                    // Turning on - just show the input
                    aliasEnabled.value = true;
                }
            };

            // Save alias
            const saveAlias = async () => {
                if (!aliasInput.value.trim()) {
                    aliasError.value = '請輸入別名';
                    return;
                }

                aliasSaving.value = true;
                aliasError.value = '';
                try {
                    const response = await fetch(`/api/notes/${noteId.value}/alias`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ alias: aliasInput.value.trim() })
                    });

                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(data.error);
                    }

                    currentAlias.value = data.shareAlias;
                    aliasError.value = '';
                } catch (e) {
                    aliasError.value = e.message;
                } finally {
                    aliasSaving.value = false;
                }
            };

            // Load alias when opening share modal
            const loadNoteAlias = async () => {
                try {
                    const response = await fetch(`/api/notes/${noteId.value}`);
                    if (response.ok) {
                        const noteData = await response.json();
                        if (noteData.shareAlias) {
                            aliasEnabled.value = true;
                            aliasInput.value = noteData.shareAlias;
                            currentAlias.value = noteData.shareAlias;
                        } else {
                            aliasEnabled.value = false;
                            aliasInput.value = '';
                            currentAlias.value = '';
                        }
                    }
                } catch (e) {
                    console.error('[Note] Failed to load alias:', e);
                }
            };


            const createNewNote = async () => {
                try {
                    const note = await api.createNote();
                    router.push('/n/' + note.id);
                    showSidebar.value = false;
                } catch (e) { globalModal.showAlert('Error creating note'); }
            };

            const newBookTitleInputLocal = ref(null);

            const openCreateBookModal = () => {
                newBookTitle.value = '';
                newBookDescription.value = '';
                showCreateBookModalLocal.value = true;
                showSidebar.value = false;
                nextTick(() => {
                    newBookTitleInputLocal.value?.focus();
                });
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
                    window.location.href = '/b/' + book.id;
                } catch (e) { globalModal.showAlert('Error creating book'); }
            };

            // Settings modal state
            const showSettingsModal = ref(false);
            const showPermissionModal = ref(false);
            const currentUser = ref(null);
            const theme = ref(localStorage.getItem('NoteHubMD-theme') || 'light');

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
                localStorage.setItem('NoteHubMD-theme', newTheme);
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

            // Resizable divider state
            const editorWidth = ref(50); // percentage
            let isResizing = false;

            const startResize = (e) => {
                isResizing = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';

                const onMouseMove = (e) => {
                    if (!isResizing) return;
                    const container = document.querySelector('.flex-1.flex.overflow-hidden.relative');
                    if (!container) return;

                    const containerRect = container.getBoundingClientRect();
                    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

                    // Clamp between 20% and 80%
                    editorWidth.value = Math.max(20, Math.min(80, newWidth));

                    // Refresh CodeMirror
                    if (cmInstance) cmInstance.refresh();
                };

                const onMouseUp = () => {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    // Save preference to localStorage
                    localStorage.setItem('NoteHubMD-editorWidth', editorWidth.value);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            // Load saved editor width
            const savedEditorWidth = localStorage.getItem('NoteHubMD-editorWidth');
            if (savedEditorWidth) {
                editorWidth.value = parseFloat(savedEditorWidth);
            }

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
                loadSidebarBooks();
                loadPinnedItems();

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
                    lastUpdater.value = note.lastUpdater || null;
                    updatedAt.value = note.updatedAt || null;
                    lastEditedAt.value = note.lastEditedAt || null;
                    noteCommentsEnabled.value = !note.commentsDisabled; // Invert: true means enabled
                    noteIsPublic.value = note.isPublic || false;

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
                    } else if (e.message.includes('not found') || e.message.includes('Not found')) {
                        // Note doesn't exist - redirect to 404
                        window.location.href = '/404';
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

                    // Autofocus logic
                    if (canEdit.value && showEditor.value) {
                        cmInstance.focus();
                    }

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
                        lastUpdater.value = note.lastUpdater || null;
                        updatedAt.value = note.updatedAt || null;
                        lastEditedAt.value = note.lastEditedAt || null;
                        noteCommentsEnabled.value = !note.commentsDisabled;
                        noteIsPublic.value = note.isPublic || false;

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
                            router.push({ path: '/login', query: { redirect: '/n/' + newNoteId } });
                        } else if (e.message.includes('Access denied')) {
                            globalModal.showAlert('您沒有權限存取此筆記');
                            router.push('/');
                        }
                    }
                }
            });

            const noteInfoItem = computed(() => ({
                id: noteId.value,
                title: title.value || 'Untitled',
                owner: noteOwner.value,
                lastEditor: lastEditor.value,
                lastUpdater: lastUpdater.value,
                lastEditedAt: lastEditedAt.value,
                updatedAt: updatedAt.value,
                charCount: charCount.value,
                lineCount: lineCount.value,
                book: book.value,
                bookId: bookId.value,
                permission: permission.value,
                effectivePermission: effectivePermission.value,
                isOwner: isOwner.value,
                canEdit: canEdit.value,
                isPublic: noteIsPublic.value
            }));

            // Move Note support
            const books = ref([]);
            const loadAvailableBooks = async () => {
                if (!canEdit.value && !isOwner.value) return;
                try {
                    const allBooks = await api.getBooks();
                    books.value = allBooks.filter(b => b.isOwner || b.canEdit);
                } catch (e) { console.error('Failed to load books for move', e); }
            };

            watch(showNoteInfoModal, (val) => {
                if (val) loadAvailableBooks();
            });

            const handleMoveNote = async (targetBookId) => {
                try {
                    await api.updateNote(noteId.value, { bookId: targetBookId || null });
                    await loadNote(); // Refresh note data including book
                    showNoteInfoModal.value = false;
                    globalModal.showAlert('移動成功');
                } catch (e) {
                    globalModal.showAlert('移動失敗: ' + e.message);
                }
            };

            return {
                books, handleMoveNote,
                noteId,
                editorTextarea,
                previewContainer,
                previewContent,
                renderedContent,
                showEditor,
                showPreview,
                editorWidth,
                startResize,
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
                sidebarBooks,
                newBookTitleInputLocal,
                filteredSidebarBooks,
                pinnedItems,
                unpinItem,
                currentRoute,
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
                // Global View Mode
                globalViewMode,
                setGlobalViewMode,
                // Search
                openSearchModal,
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
                noteIsPublic,
                saveNoteSettings,
                shareNote,
                // Share modal
                showShareModal, shareUrl, shareCopied,
                copyShareLink, openSharePage, resetShareLink,
                // Alias
                aliasEnabled, aliasInput, currentAlias, aliasError, aliasSaving,
                toggleAlias, saveAlias,
                noteInfoItem
            };
        }
    };

    // Routes
    const routes = [
        { path: '/n/:id', component: Note, name: 'note' }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes
    });

    // Create Vue App
    const app = createApp({
        components: { InfoModal, SidebarNav },
        setup() {
            // Modal state
            const modal = reactive({
                show: false,
                type: 'alert',
                title: '',
                message: '',
                confirmText: '',
                cancelText: '',
                resolve: null
            });

            const showAlert = (message, options = {}) => {
                return new Promise(resolve => {
                    modal.show = true;
                    modal.type = options.type || 'alert';
                    modal.title = options.title || '';
                    modal.message = message;
                    modal.confirmText = options.confirmText || '確定';
                    modal.cancelText = options.cancelText || '取消';
                    modal.resolve = resolve;
                });
            };

            const showConfirm = (message, options = {}) => {
                return new Promise(resolve => {
                    modal.show = true;
                    modal.type = 'confirm';
                    modal.title = options.title || '';
                    modal.message = message;
                    modal.confirmText = options.confirmText || '確定';
                    modal.cancelText = options.cancelText || '取消';
                    modal.resolve = resolve;
                });
            };

            const closeModal = (result = true) => {
                modal.show = false;
                if (modal.resolve) {
                    modal.resolve(result);
                    modal.resolve = null;
                }
            };

            return {
                modal,
                showAlert,
                showConfirm,
                closeModal
            };
        }
    });

    app.use(router);

    // Register global components
    app.component('InfoModal', InfoModal);
    app.component('SidebarNav', SidebarNav);

    // Mount app and get the instance
    const vm = app.mount('#app');

    // Set app instance for global modal
    setAppInstance(vm);

    // Apply theme
    const theme = localStorage.getItem('NoteHubMD-theme') || 'dark';
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    // Configure highlight.js themes based on dark mode
    const updateHljsTheme = () => {
        const isDark = document.documentElement.classList.contains('dark');
        document.getElementById('hljs-light-theme').disabled = isDark;
        document.getElementById('hljs-dark-theme').disabled = !isDark;
    };
    updateHljsTheme();

    // Watch for theme changes
    const observer = new MutationObserver(updateHljsTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
})();
