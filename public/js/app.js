const { createApp, ref, onMounted, computed, watch, nextTick } = Vue;
const { createRouter, createWebHistory, useRoute } = VueRouter;

const socket = io();

// Utils
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
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
        if (!res.ok) throw new Error('Note not found');
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
    async createBook() {
        const res = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        return res.json();
    },
    async getBook(id) {
        const res = await fetch('/api/books/' + id);
        if (!res.ok) throw new Error('Book not found');
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
    async getBooks() {
        const res = await fetch('/api/books');
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
    }
};

// --- Components ---

const Login = {
    template: '#login-template',
    setup() {
        const router = VueRouter.useRouter();
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
                window.location.href = '/';
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
    setup() {
        const showSettings = ref(false);
        const theme = ref(localStorage.getItem('theme') || 'dark');

        const setTheme = (t) => {
            theme.value = t;
            localStorage.setItem('theme', t);
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

        onMounted(() => {
            updateThemeClass(theme.value);
        });

        return { showSettings, theme, setTheme, logout };
    }
};

const Layout = {
    template: '#layout-template',
    components: { Sidebar },
    setup() {
        const user = ref(null);
        const router = VueRouter.useRouter();

        onMounted(async () => {
            try {
                user.value = await api.getMe();
            } catch (e) {
                router.push('/login');
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

        const loadData = async () => {
            try {
                notes.value = await api.getNotes();
                books.value = await api.getBooks();
            } catch (e) {
                // Error handling handled by global auth check mostly
            }
        };

        const createNote = async () => {
            try {
                const note = await api.createNote();
                router.push('/note/' + note.id);
            } catch (e) { alert('Error creating note'); }
        };

        const createBook = async () => {
            try {
                const book = await api.createBook();
                router.push('/book/' + book.id);
            } catch (e) { alert('Error creating book'); }
        };

        const deleteNote = async (id, event) => {
            event.stopPropagation();
            if (!confirm('確定要刪除此筆記？（可從垃圾桶還原）')) return;
            try {
                await api.deleteNote(id);
                notes.value = notes.value.filter(n => n.id !== id);
            } catch (e) { alert('刪除失敗'); }
        };

        const deleteBook = async (id, event) => {
            event.stopPropagation();
            if (!confirm('確定要刪除此書本？（可從垃圾桶還原）')) return;
            try {
                await api.deleteBook(id);
                books.value = books.value.filter(b => b.id !== id);
            } catch (e) { alert('刪除失敗'); }
        };

        onMounted(loadData);

        return { notes, books, createNote, createBook, deleteNote, deleteBook };
    }
};

const Book = {
    template: '#book-template',
    setup() {
        const route = useRoute();
        const router = VueRouter.useRouter();
        const book = ref({});

        const loadBook = async () => {
            try {
                book.value = await api.getBook(route.params.id);
            } catch (e) { alert('Book not found'); router.push('/'); }
        };

        const createNote = async () => {
            try {
                const note = await api.createNoteInBook(book.value.id);
                router.push('/note/' + note.id);
            } catch (e) { alert('Error creating note'); }
        };

        onMounted(loadBook);

        return { book, createNote };
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
        const content = ref('');
        const title = ref('');
        const renderedContent = ref('');
        const toc = ref([]);
        const activeTocId = ref('');
        const saving = ref(false);
        const permission = ref('private');
        const isOwner = ref(false);
        const canEdit = ref(true);
        const permissionOptions = [
            { value: 'public-edit', label: '可編輯' },
            { value: 'auth-edit', label: '可編輯(需登入)' },
            { value: 'public-view', label: '唯讀' },
            { value: 'auth-view', label: '唯讀(需登入)' },
            { value: 'private', label: '私人' }
        ];
        const md = window.markdownit({
            html: true,
            breaks: true,
            highlight: function (str, lang) {
                // Handle mermaid code blocks specially
                if (lang && lang.toLowerCase() === 'mermaid') {
                    return '<div class="mermaid">' + str + '</div>';
                }
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return '<pre class="hljs"><code>' +
                            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                            '</code></pre>';
                    } catch (__) { }
                }
                return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
            }
        });

        const themes = [
            { label: '預設', value: 'default' },
            { label: 'Ayu Dark', value: 'ayu-dark' },
            { label: 'Bespin', value: 'bespin' },
            { label: 'Colorforth', value: 'colorforth' },
            { label: 'Duotone Dark', value: 'duotone-dark' },
            { label: 'Eclipse', value: 'eclipse' },
            { label: 'Material Darker', value: 'material-darker' },
            { label: 'Material Palenight', value: 'material-palenight' },
            { label: 'Material', value: 'material' },
            { label: 'Monokai', value: 'monokai' },
            { label: 'Nord', value: 'nord' },
            { label: 'Panda Syntax', value: 'panda-syntax' },
            { label: 'Railscats', value: 'railscats' },
            { label: 'Rubyblue', value: 'rubyblue' },
            { label: 'Solarized', value: 'solarized' },
            { label: 'XQ Light', value: 'xq-light' },
            { label: 'XQ Dark', value: 'xq-dark' },
        ];
        const selectedTheme = ref(localStorage.getItem('editorTheme') || 'duotone-dark');

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
            renderedContent.value = md.render(content.value);
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

        const handlePermissionChange = async (newPermission) => {
            try {
                await api.updatePermission(noteId.value, newPermission);
                permission.value = newPermission;
            } catch (e) {
                console.error('Failed to update permission', e);
                alert('無法更新權限：' + e.message);
            }
        };


        onMounted(async () => {
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
                isOwner.value = note.isOwner || false;
                canEdit.value = note.canEdit !== undefined ? note.canEdit : true;
            } catch (e) {
                console.error('Failed to load note', e);
                // Handle access errors
                if (e.message.includes('Login required')) {
                    alert('需要登入才能存取此筆記');
                    router.push('/login');
                    return;
                } else if (e.message.includes('Access denied')) {
                    alert('您沒有權限存取此筆記');
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

                // Initial render
                updatePreview();

                // Socket Join
                socket.emit('join-note', noteId.value);

                // Socket Listen
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
            }
        });

        watch(selectedTheme, (newTheme) => {
            localStorage.setItem('editorTheme', newTheme);
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

        return {
            noteId,
            editorTextarea,
            previewContainer,
            renderedContent,
            showEditor,
            showPreview,
            mode,
            setMode,
            handlePreviewScroll,
            saving,
            themes,
            selectedTheme,
            toc,
            activeTocId,
            scrollToHeading,
            permission,
            isOwner,
            canEdit,
            permissionOptions,
            handlePermissionChange
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
            } catch (e) { alert('還原失敗'); }
        };

        const forceDeleteNote = async (id) => {
            if (!confirm('確定要永久刪除此筆記？此操作無法復原！')) return;
            try {
                await api.forceDeleteNote(id);
                notes.value = notes.value.filter(n => n.id !== id);
            } catch (e) { alert('刪除失敗'); }
        };

        const restoreBook = async (id) => {
            try {
                await api.restoreBook(id);
                books.value = books.value.filter(b => b.id !== id);
            } catch (e) { alert('還原失敗'); }
        };

        const forceDeleteBook = async (id) => {
            if (!confirm('確定要永久刪除此書本？此操作無法復原！')) return;
            try {
                await api.forceDeleteBook(id);
                books.value = books.value.filter(b => b.id !== id);
            } catch (e) { alert('刪除失敗'); }
        };

        onMounted(loadTrash);

        return { notes, books, loading, restoreNote, forceDeleteNote, restoreBook, forceDeleteBook };
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
        next('/login');
    }
});

const app = createApp({
    setup() {
        onMounted(() => {
            const theme = localStorage.getItem('theme') || 'dark';
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        });
        return {};
    }
});

app.component('Sidebar', Sidebar);
app.use(router);
app.mount('#app');
