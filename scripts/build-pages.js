/**
 * Build script to extract templates from index.html and create page-specific HTML files
 * Run with: node scripts/build-pages.js
 */

const fs = require('fs');
const path = require('path');

// Read the main index.html
const indexPath = path.join(__dirname, '../public/index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

// Template boundaries (from implementation plan)
const templates = {
    'book-card-template': { start: 143, end: 184 },
    'note-card-template': { start: 187, end: 296 },
    'info-modal-template': { start: 299, end: 564 },
    'sidebar-nav-template': { start: 567, end: 829 },
    'login-template': { start: 831, end: 862 },
    'sidebar-template': { start: 864, end: 1242 },
    'layout-template': { start: 1244, end: 1252 },
    'home-template': { start: 1254, end: 1467 },
    'allbooks-template': { start: 1470, end: 1522 },
    'uncategorized-template': { start: 1524, end: 1599 },
    'trash-template': { start: 1601, end: 1673 },
    'admin-template': { start: 1675, end: 1761 },
    'book-template': { start: 1763, end: 1855 },
    'note-template': { start: 1857, end: 2516 }
};

// Extract a template by line numbers
function extractTemplate(content, startLine, endLine) {
    const lines = content.split(/\r?\n/);
    return lines.slice(startLine - 1, endLine).join('\n');
}

// Extract templates needed for note.html
const noteRequired = ['note-template', 'info-modal-template', 'sidebar-nav-template'];

console.log('Extracting templates for note.html...');
const noteTemplates = {};
for (const name of noteRequired) {
    const t = templates[name];
    noteTemplates[name] = extractTemplate(indexContent, t.start, t.end);
    console.log(`  - ${name}: lines ${t.start}-${t.end}`);
}

// Create note.html
const noteHtmlContent = `<!DOCTYPE html>
<html lang="zh-TW">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NoteHubMD</title>

    <!-- TailwindCSS (compiled) -->
    <link rel="stylesheet" href="/css/tailwind.min.css">

    <!-- Vue & Vue Router -->
    <script src="/vendors/js/vue.global.prod.js"></script>
    <script src="/vendors/js/vue-router.global.prod.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <script src="/vendors/js/morphdom.min.js"></script>

    <!-- CodeMirror 5 (CSS bundled) -->
    <link rel="stylesheet" href="/vendors/css/codemirror.bundle.css">
    <script src="/vendors/js/codemirror/codemirror.min.js"></script>
    <script src="/vendors/js/codemirror/mode/markdown.min.js"></script>
    <script src="/vendors/js/codemirror/mode/xml.min.js"></script>
    <script src="/vendors/js/codemirror/mode/javascript.min.js"></script>
    <script src="/vendors/js/codemirror/mode/css.min.js"></script>
    <script src="/vendors/js/codemirror/mode/htmlmixed.min.js"></script>
    <script src="/vendors/js/codemirror/mode/clike.min.js"></script>
    <script src="/vendors/js/codemirror/mode/python.min.js"></script>
    <script src="/vendors/js/codemirror/mode/shell.min.js"></script>
    <script src="/vendors/js/codemirror/mode/sql.min.js"></script>
    <script src="/vendors/js/codemirror/mode/go.min.js"></script>
    <script src="/vendors/js/codemirror/mode/yaml.min.js"></script>
    <script src="/vendors/js/codemirror/mode/powershell.min.js"></script>
    <script src="/vendors/js/codemirror/mode/vbscript.min.js"></script>
    <script src="/vendors/js/codemirror/addon/placeholder.min.js"></script>
    <script src="/vendors/js/codemirror/addon/show-hint.min.js"></script>

    <!-- Markdown-it -->
    <script src="/vendors/js/markdown-it/markdown-it.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-container.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-anchor.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-imsize.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-mark.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-sup.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-emoji.min.js"></script>
    <script src="/vendors/js/markdown-it/markdown-it-task-lists.min.js"></script>
    <link rel="stylesheet" href="/vendors/css/github-markdown.min.css">

    <!-- Highlight.js for syntax highlighting -->
    <link rel="stylesheet" href="/vendors/css/highlight/github.min.css" id="hljs-light-theme">
    <link rel="stylesheet" href="/vendors/css/highlight/github-dark.min.css" id="hljs-dark-theme" disabled>
    <script src="/vendors/js/highlight.min.js"></script>

    <!-- Font Awesome -->
    <link rel="stylesheet" href="/vendors/css/fontawesome/all.min.css">

    <!-- Mermaid -->
    <script src="/vendors/js/mermaid.min.js"></script>

    <!-- Day.js for date/time manipulation -->
    <script src="/vendors/js/dayjs/dayjs.min.js"></script>
    <script src="/vendors/js/dayjs/relativeTime.js"></script>
    <script src="/vendors/js/dayjs/zh-tw.js"></script>
    <script>
        dayjs.extend(dayjs_plugin_relativeTime);
        dayjs.locale('zh-tw');
    </script>

    <link rel="stylesheet" href="/css/style.css">

    <!-- Apply theme immediately to prevent flash -->
    <script>
        (function() {
            var theme = localStorage.getItem('NoteHubMD-theme') || 'dark';
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
</head>

<body
    class="bg-gray-100 dark:bg-dark-bg h-screen overflow-hidden text-gray-900 dark:text-dark-text transition-colors duration-200">
    <div id="app" class="h-full flex flex-col">
        <router-view></router-view>

        <!-- Global Modal (replaces alert/confirm) -->
        <Teleport to="body">
            <Transition name="fade">
                <div v-if="$root.modal.show"
                    class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50" style="z-index: 200;"
                    @click.self="$root.modal.type === 'alert' ? $root.closeModal() : null">
                    <Transition name="modal-scale">
                        <div v-if="$root.modal.show"
                            class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                            <!-- Header -->
                            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center"
                                :class="{
                                    'bg-blue-50 dark:bg-blue-900/20': $root.modal.type === 'info',
                                    'bg-green-50 dark:bg-green-900/20': $root.modal.type === 'success',
                                    'bg-yellow-50 dark:bg-yellow-900/20': $root.modal.type === 'warning',
                                    'bg-red-50 dark:bg-red-900/20': $root.modal.type === 'error' || $root.modal.type === 'confirm'
                                }">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center mr-3" :class="{
                                        'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300': $root.modal.type === 'info' || $root.modal.type === 'alert',
                                        'bg-green-100 text-green-600 dark:bg-green-800 dark:text-green-300': $root.modal.type === 'success',
                                        'bg-yellow-100 text-yellow-600 dark:bg-yellow-800 dark:text-yellow-300': $root.modal.type === 'warning',
                                        'bg-red-100 text-red-600 dark:bg-red-800 dark:text-red-300': $root.modal.type === 'error' || $root.modal.type === 'confirm'
                                    }">
                                    <i class="fa-solid text-lg" :class="{
                                        'fa-circle-info': $root.modal.type === 'info' || $root.modal.type === 'alert',
                                        'fa-circle-check': $root.modal.type === 'success',
                                        'fa-triangle-exclamation': $root.modal.type === 'warning',
                                        'fa-circle-xmark': $root.modal.type === 'error',
                                        'fa-question-circle': $root.modal.type === 'confirm'
                                    }"></i>
                                </div>
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                                    {{ $root.modal.title || ($root.modal.type === 'confirm' ? '確認' : '提示') }}
                                </h3>
                            </div>
                            <!-- Body -->
                            <div class="px-6 py-4">
                                <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ $root.modal.message
                                    }}</p>
                            </div>
                            <!-- Footer -->
                            <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
                                <button v-if="$root.modal.type === 'confirm'" @click="$root.closeModal(false)"
                                    class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                                    {{ $root.modal.cancelText || '取消' }}
                                </button>
                                <button @click="$root.closeModal(true)"
                                    class="px-4 py-2 text-white rounded-lg transition" :class="{
                                        'bg-blue-600 hover:bg-blue-700': $root.modal.type === 'info' || $root.modal.type === 'alert',
                                        'bg-green-600 hover:bg-green-700': $root.modal.type === 'success',
                                        'bg-yellow-600 hover:bg-yellow-700': $root.modal.type === 'warning',
                                        'bg-red-600 hover:bg-red-700': $root.modal.type === 'error' || $root.modal.type === 'confirm'
                                    }">
                                    {{ $root.modal.confirmText || '確定' }}
                                </button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>

    <!-- Templates -->
${noteTemplates['info-modal-template']}

${noteTemplates['sidebar-nav-template']}

${noteTemplates['note-template']}

    <script src="/js/common.js"></script>
    <script src="/js/components.js"></script>
    <script src="/js/note.js"></script>
</body>

</html>
`;

// Write note.html
const noteHtmlPath = path.join(__dirname, '../public/note.html');
fs.writeFileSync(noteHtmlPath, noteHtmlContent, 'utf8');
console.log(`\nCreated: ${noteHtmlPath}`);
console.log(`Size: ${noteHtmlContent.length} bytes`);

// ===== Create note.js =====
console.log('\nExtracting Note component for note.js...');

const appJsPath = path.join(__dirname, '../public/js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
const appJsLines = appJsContent.split(/\r?\n/);

// Note component is from line 2138 to 3881
const noteComponentLines = appJsLines.slice(2137, 3881);
const noteComponent = noteComponentLines.join('\n');

console.log(`  - Note component: lines 2138-3881 (${noteComponentLines.length} lines)`);

const noteJsContent = `/**
 * NoteHubMD Note Page Script
 * Handles note editor functionality with real-time collaboration
 */

// Use IIFE to avoid polluting global scope
(function() {
    // Get dependencies from common.js
    const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } = window.NoteHubMD.Vue;
    const { createRouter, createWebHistory, useRoute } = window.NoteHubMD.VueRouter;
    const { socket, api, globalModal, setAppInstance, debounce, extractTags, compressImage } = window.NoteHubMD;

    // Get components from components.js
    const { SidebarNav, InfoModal } = window.NoteHubMD.components;

${noteComponent}

// Routes
const routes = [
    { path: '/note/:id', component: Note, name: 'note' }
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

// Mount app
app.mount('#app');

// Set app instance for global modal
setAppInstance(app._instance.proxy);

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
`;

const noteJsPath = path.join(__dirname, '../public/js/note.js');
fs.writeFileSync(noteJsPath, noteJsContent, 'utf8');
console.log(`Created: ${noteJsPath}`);
console.log(`Size: ${noteJsContent.length} bytes`);

console.log('\nBuild complete!');

// ===== Create home.js =====
console.log('\nExtracting Home components for home.js...');

// Home-related component line ranges (from app.js)
// Note: Note component (2138-3881) is NOT included - it's in note.js
const homeComponents = [
    { name: 'Sidebar', start: 733, end: 1226 },
    { name: 'Layout', start: 1228, end: 1246 },
    { name: 'Home', start: 1248, end: 1856 },
    { name: 'Book', start: 1857, end: 2137 },
    { name: 'Uncategorized', start: 3884, end: 4002 },
    { name: 'AllBooks', start: 4003, end: 4146 },
    { name: 'Trash', start: 4147, end: 4202 },
    { name: 'Admin', start: 4203, end: 4308 }
];

let homeComponentsCode = '';
for (const comp of homeComponents) {
    const lines = appJsLines.slice(comp.start - 1, comp.end);
    homeComponentsCode += lines.join('\n') + '\n\n';
    console.log(`  - ${comp.name}: lines ${comp.start}-${comp.end} (${lines.length} lines)`);
}

const homeJsContent = `/**
 * NoteHubMD Home Page Script
 * Handles home, book list, and admin pages
 */

// Use IIFE to avoid polluting global scope
(function() {
    // Get dependencies from common.js
    const { createApp, ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } = window.NoteHubMD.Vue;
    const { createRouter, createWebHistory, useRoute } = window.NoteHubMD.VueRouter;
    const { api, globalModal, setAppInstance, debounce, extractTags, compressImage } = window.NoteHubMD;

    // Get components from components.js
    const { SidebarNav, InfoModal, BookCard, NoteCard } = window.NoteHubMD.components;

${homeComponentsCode}


// Routes for Home pages (Note and Login are separate pages)
const routes = [
    {
        path: '/',
        component: Layout,
        children: [
            { path: '', component: Home },
            { path: 'book/:id', component: Book },
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

// Mount app
app.mount('#app');

// Set app instance for global modal
setAppInstance(app._instance.proxy);
})();
`;

const homeJsPath = path.join(__dirname, '../public/js/home.js');
fs.writeFileSync(homeJsPath, homeJsContent, 'utf8');
console.log(`Created: ${homeJsPath}`);
console.log(`Size: ${homeJsContent.length} bytes`);

console.log('\nAll files built successfully!');

