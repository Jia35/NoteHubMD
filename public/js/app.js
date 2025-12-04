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
    async register(username, password, email) {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email })
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
    }
};

// --- Components ---

const Login = {
    template: `
        <div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-dark-bg">
            <div class="bg-white dark:bg-dark-surface p-8 rounded-lg shadow-md w-full max-w-md border border-gray-200 dark:border-gray-700">
                <h2 class="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white">{{ isRegister ? 'Create Account' : 'Login to NoteHubMD' }}</h2>
                
                <form @submit.prevent="handleSubmit">
                    <div class="mb-4">
                        <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Username</label>
                        <input v-model="username" type="text" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" required>
                    </div>
                    
                    <div v-if="isRegister" class="mb-4">
                        <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Email</label>
                        <input v-model="email" type="email" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600">
                    </div>

                    <div class="mb-6">
                        <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Password</label>
                        <input v-model="password" type="password" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" required>
                    </div>

                    <div v-if="error" class="mb-4 text-red-500 text-sm text-center">{{ error }}</div>

                    <button type="submit" class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition">
                        {{ isRegister ? 'Register' : 'Login' }}
                    </button>
                </form>

                <div class="mt-4 text-center">
                    <button @click="toggleMode" class="text-blue-600 hover:text-blue-800 text-sm">
                        {{ isRegister ? 'Already have an account? Login' : 'Need an account? Register' }}
                    </button>
                </div>
            </div>
        </div>
    `,
    setup() {
        const router = VueRouter.useRouter();
        const isRegister = ref(false);
        const username = ref('');
        const password = ref('');
        const email = ref('');
        const error = ref('');

        const toggleMode = () => {
            isRegister.value = !isRegister.value;
            error.value = '';
        };

        const handleSubmit = async () => {
            error.value = '';
            try {
                if (isRegister.value) {
                    await api.register(username.value, password.value, email.value);
                } else {
                    await api.login(username.value, password.value);
                }
                window.location.href = '/';
            } catch (e) {
                error.value = e.message;
            }
        };

        return { isRegister, username, password, email, error, toggleMode, handleSubmit };
    }
};

const Sidebar = {
    template: `
        <div class="w-64 bg-gray-900 text-white flex flex-col h-full border-r border-gray-800 shrink-0">
            <!-- Header -->
            <router-link to="/" class="p-4 flex items-center border-b border-gray-800 hover:bg-gray-800 transition">
                <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center mr-3 font-bold">N</div>
                <span class="font-bold text-lg tracking-wide">NoteHubMD</span>
            </router-link>

            <!-- Navigation -->
            <div class="flex-1 overflow-y-auto p-4 space-y-2">
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Menu</div>
                <router-link to="/" class="block px-3 py-2 rounded hover:bg-gray-800 text-gray-300 hover:text-white transition flex items-center">
                    <span class="mr-3">🏠</span> Home
                </router-link>
            </div>

            <!-- User & Settings -->
            <div class="p-4 border-t border-gray-800 bg-gray-900">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center overflow-hidden">
                        <div class="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center mr-2 shrink-0">
                            {{ user?.username?.charAt(0).toUpperCase() || '?' }}
                        </div>
                        <span class="text-sm font-medium truncate">{{ user?.username || 'Guest' }}</span>
                    </div>
                    <button @click="showSettings = true" class="text-gray-400 hover:text-white transition ml-2">
                        ⚙️
                    </button>
                </div>
            </div>

            <!-- Settings Modal -->
            <div v-if="showSettings" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showSettings = false">
                <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-96 text-gray-900 dark:text-gray-100">
                    <h2 class="text-xl font-bold mb-4">Settings</h2>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">Theme</label>
                        <div class="flex space-x-2">
                            <button @click="setTheme('light')" class="px-4 py-2 rounded border" :class="theme === 'light' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'">Light</button>
                            <button @click="setTheme('dark')" class="px-4 py-2 rounded border" :class="theme === 'dark' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'">Dark</button>
                        </div>
                    </div>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <button @click="logout" class="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">Logout</button>
                    </div>

                    <div class="flex justify-end mt-4">
                        <button @click="showSettings = false" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `,
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
    template: `
        <div class="flex h-full w-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text transition-colors duration-200">
            <Sidebar :user="user" />
            <div class="flex-1 flex flex-col overflow-hidden">
                <router-view v-if="user"></router-view>
                <div v-else class="flex items-center justify-center h-full">Loading...</div>
            </div>
        </div>
    `,
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
    template: `
        <div class="p-8 container mx-auto overflow-y-auto h-full">
            <h1 class="text-4xl font-bold mb-8 text-gray-800 dark:text-white">NoteHubMD</h1>
            
            <div class="flex space-x-4 mb-8">
                <button @click="createNote" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition shadow flex items-center">
                    <span class="mr-2">+</span> New Note
                </button>
                <button @click="createBook" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition shadow flex items-center">
                    <span class="mr-2">+</span> New Book
                </button>
            </div>

            <div class="mb-8">
                <h2 class="text-2xl font-bold mb-4 text-gray-700 dark:text-gray-300">Recent Books</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div v-for="book in books" :key="book.id" class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow hover:shadow-xl cursor-pointer transition border border-gray-200 dark:border-gray-700" @click="$router.push('/book/' + book.id)">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">📚</span>
                            <h3 class="font-bold text-xl text-gray-800 dark:text-white">{{ book.title }}</h3>
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 text-sm">{{ book.description || 'No description' }}</p>
                    </div>
                </div>
            </div>

            <div>
                <h2 class="text-2xl font-bold mb-4 text-gray-700 dark:text-gray-300">Recent Notes</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div v-for="note in notes" :key="note.id" class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow hover:shadow-xl cursor-pointer transition border border-gray-200 dark:border-gray-700" @click="$router.push('/note/' + note.id)">
                        <div class="flex items-center mb-2">
                            <span class="text-2xl mr-2">📝</span>
                            <h3 class="font-bold text-xl text-gray-800 dark:text-white">{{ note.title }}</h3>
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 text-sm">Last updated: {{ new Date(note.updatedAt).toLocaleString() }}</p>
                    </div>
                </div>
            </div>
        </div>
    `,
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

        onMounted(loadData);

        return { notes, books, createNote, createBook };
    }
};

const Book = {
    template: `
        <div class="p-8 container mx-auto overflow-y-auto h-full">
            <div class="mb-6 flex items-center text-gray-500 dark:text-gray-400">
                <router-link to="/" class="hover:text-blue-500">Home</router-link>
                <span class="mx-2">/</span>
                <span>{{ book.title }}</span>
            </div>

            <div class="flex justify-between items-center mb-8">
                <h1 class="text-4xl font-bold text-gray-800 dark:text-white flex items-center">
                    <span class="mr-3">📚</span> {{ book.title }}
                </h1>
                <button @click="createNote" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
                    + Add Note
                </button>
            </div>

            <div class="bg-white dark:bg-dark-surface rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
                <div v-for="note in book.Notes" :key="note.id" class="p-4 border-b dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex justify-between items-center" @click="$router.push('/note/' + note.id)">
                    <div class="flex items-center">
                        <span class="mr-3 text-gray-400">📝</span>
                        <span class="font-medium text-lg text-gray-800 dark:text-gray-200">{{ note.title }}</span>
                    </div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">{{ new Date(note.updatedAt).toLocaleDateString() }}</span>
                </div>
                <div v-if="!book.Notes || book.Notes.length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
                    No notes in this book yet.
                </div>
            </div>
        </div>
    `,
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
    template: `
        <div class="flex flex-col h-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text">
            <!-- Toolbar -->
            <div class="bg-gray-900 text-white p-3 flex items-center justify-between shadow-md z-10 shrink-0">
                <div class="flex items-center space-x-3">
                    <router-link to="/" class="hover:text-blue-400 transition font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    </router-link>
                    <span class="text-gray-600">/</span>
                    <span class="font-mono text-sm bg-gray-800 px-2 py-1 rounded">{{ noteId }}</span>
                    <span v-if="saving" class="text-xs text-gray-400 ml-2">Saving...</span>
                    <span v-else class="text-xs text-gray-500 ml-2">Saved</span>
                </div>
                <div class="flex bg-gray-800 rounded-lg p-1 space-x-1">
                    <button @click="setMode('edit')" class="w-8 h-8 flex items-center justify-center rounded transition" :class="mode === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'" title="Edit">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button @click="setMode('both')" class="w-8 h-8 flex items-center justify-center rounded transition" :class="mode === 'both' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'" title="Both">
                        <i class="fa-solid fa-columns"></i>
                    </button>
                    <button @click="setMode('view')" class="w-8 h-8 flex items-center justify-center rounded transition" :class="mode === 'view' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'" title="View">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            
            <!-- Content -->
            <div class="flex-1 flex overflow-hidden relative">
                <!-- Editor -->
                <div v-show="showEditor" class="h-full flex flex-col border-r border-gray-700" :class="{'w-full': !showPreview, 'w-1/2': showPreview}">
                    <textarea ref="editorTextarea"></textarea>
                </div>
                
                <!-- Preview -->
                <div v-show="showPreview" 
                     class="h-full overflow-auto bg-white dark:bg-dark-bg p-8 markdown-body dark:text-gray-300" 
                     :class="{'w-full': !showEditor, 'w-1/2': showEditor}" 
                     ref="previewContainer" 
                     v-html="renderedContent"
                     @scroll="handlePreviewScroll">
                </div>
            </div>
        </div>
    `,
    setup() {
        const route = useRoute();
        const router = VueRouter.useRouter();
        const noteId = computed(() => route.params.id);

        const editorTextarea = ref(null);
        const previewContainer = ref(null);
        const content = ref('');
        const renderedContent = ref('');
        const saving = ref(false);
        const md = window.markdownit({
            html: true,
            breaks: true,
            // linkify: true,
            // typographer: true
        });
        let cmInstance = null;

        // Mode handling
        const mode = ref(route.query.mode || 'both');

        const showEditor = computed(() => mode.value === 'both' || mode.value === 'edit');
        const showPreview = computed(() => mode.value === 'both' || mode.value === 'view');

        const setMode = (newMode) => {
            mode.value = newMode;
            router.replace({ query: { ...route.query, mode: newMode } });
            nextTick(() => {
                if (cmInstance) cmInstance.refresh();
            });
        };

        const updatePreview = () => {
            renderedContent.value = md.render(content.value);
        };

        // Sync Scroll
        const handleEditorScroll = (cm) => {
            if (mode.value !== 'both' || !previewContainer.value) return;

            const scrollInfo = cm.getScrollInfo();
            const percentage = scrollInfo.top / (scrollInfo.height - scrollInfo.clientHeight);

            const preview = previewContainer.value;
            preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
        };

        const handlePreviewScroll = (e) => {
            // Optional
        };

        const saveContent = debounce(async (val) => {
            saving.value = true;
            try {
                await api.updateNote(noteId.value, { content: val });
            } catch (e) {
                console.error('Save failed', e);
            } finally {
                saving.value = false;
            }
        }, 1000);



        onMounted(async () => {
            // Fetch Note
            try {
                const note = await api.getNote(noteId.value);
                content.value = note.content || '';
            } catch (e) {
                console.error('Failed to load note', e);
            }

            if (editorTextarea.value) {
                cmInstance = CodeMirror.fromTextArea(editorTextarea.value, {
                    mode: 'markdown',
                    theme: 'one-dark',
                    lineNumbers: true,
                    lineWrapping: true,
                });

                cmInstance.setValue(content.value);

                cmInstance.on('change', (cm) => {
                    const val = cm.getValue();
                    if (val !== content.value) {
                        content.value = val;
                        updatePreview();
                        // Emit change
                        socket.emit('edit-note', { noteId: noteId.value, content: val });
                        // Save to DB
                        saveContent(val);
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
                        cmInstance.setValue(newContent);
                        cmInstance.setCursor(cursor);
                        updatePreview();
                    }
                });
            }
        });

        watch(() => route.query.mode, (newMode) => {
            if (newMode) mode.value = newMode;
            nextTick(() => {
                if (cmInstance) cmInstance.refresh();
            });
        });

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
            saving
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
    if (to.path === '/login') {
        next();
        return;
    }

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
