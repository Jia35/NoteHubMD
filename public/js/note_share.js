/**
 * NoteHubMD Share Page Script
 * Handles read-only note sharing with preview and TOC
 */

(function () {
    const { createApp, ref, computed, onMounted, onUnmounted, watch, nextTick } = window.NoteHubMD.Vue;
    const { createRouter, createWebHistory, useRoute } = window.NoteHubMD.VueRouter;
    const { api, globalModal, setAppInstance } = window.NoteHubMD;

    const SharePage = {
        template: '#share-template',
        setup() {
            const route = useRoute();
            const shareId = computed(() => route.params.shareId);

            const loading = ref(true);
            const error = ref('');
            const noteId = ref('');
            const title = ref('');
            const content = ref('');
            const renderedContent = ref('');
            const toc = ref([]);
            const activeTocId = ref('');
            const noteOwner = ref(null);
            const lastEditor = ref(null);
            const lastEditedAt = ref(null);
            const canEdit = ref(false);
            const lightboxImage = ref('');
            const previewContainer = ref(null);
            const previewContent = ref(null);

            // Book navigation
            const book = ref(null);

            // Book notes sorted by order (only those with share links)
            const bookNotes = computed(() => {
                if (!book.value || !book.value.Notes) return [];
                return book.value.Notes
                    .filter(n => n.shareId || n.shareAlias)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
            });

            // Current note index in book
            const currentNoteIndex = computed(() => {
                if (!bookNotes.value.length) return -1;
                return bookNotes.value.findIndex(n => n.id === noteId.value);
            });

            // Previous note in book
            const prevNote = computed(() => {
                const idx = currentNoteIndex.value;
                if (idx <= 0) return null;
                return bookNotes.value[idx - 1];
            });

            // Next note in book
            const nextNote = computed(() => {
                const idx = currentNoteIndex.value;
                if (idx < 0 || idx >= bookNotes.value.length - 1) return null;
                return bookNotes.value[idx + 1];
            });

            // Get share link for a note
            const getNoteShareLink = (note) => {
                return '/s/' + (note.shareAlias || note.shareId);
            };

            // Theme
            const theme = ref(localStorage.getItem('NoteHubMD-theme') || 'dark');

            const toggleTheme = () => {
                const newTheme = theme.value === 'dark' ? 'light' : 'dark';
                theme.value = newTheme;
                localStorage.setItem('NoteHubMD-theme', newTheme);

                if (newTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }

                // Update highlight.js themes
                const hljsLight = document.getElementById('hljs-light-theme');
                const hljsDark = document.getElementById('hljs-dark-theme');
                if (hljsLight && hljsDark) {
                    hljsLight.disabled = newTheme === 'dark';
                    hljsDark.disabled = newTheme !== 'dark';
                }
            };

            // Format relative time
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

            const relativeLastEditedTime = computed(() => formatRelativeTime(lastEditedAt.value));

            // Parse code block info for syntax highlighting
            const parseCodeBlockInfo = (info) => {
                const result = {
                    language: '',
                    wordWrap: false,
                    lineNumbers: false,
                    startLine: 1
                };

                if (!info) return result;

                const match = info.match(/^([a-zA-Z0-9_+-]*)(!?)(=?)(\d*)$/);
                if (match) {
                    result.language = match[1] || '';
                    result.wordWrap = match[2] === '!';
                    result.lineNumbers = match[3] === '=';
                    if (match[4]) {
                        result.startLine = parseInt(match[4], 10);
                        result.lineNumbers = true;
                    }
                } else {
                    result.language = info;
                }

                return result;
            };

            // Initialize Markdown-it
            const md = window.markdownit({
                html: true,
                breaks: true,
                linkify: true,
                highlight: function (str, lang) {
                    const parsed = parseCodeBlockInfo(lang);
                    const actualLang = parsed.language.toLowerCase();

                    if (actualLang === 'mermaid') {
                        return '<div class="mermaid">' + str + '</div>';
                    }

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

                    if (parsed.lineNumbers) {
                        const lines = highlightedCode.split('\n');
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
                                return '<div class="alert alert-' + type + '">\n' +
                                    (m[1] ? '<strong>' + md.utils.escapeHtml(m[1]) + '</strong>' : '');
                            } else {
                                return '</div>\n';
                            }
                        }
                    });
                });

                md.use(window.markdownitContainer, 'spoiler', {
                    validate: function (params) {
                        return params.trim().match(/^spoiler\s+(.*)$/);
                    },
                    render: function (tokens, idx) {
                        var m = tokens[idx].info.trim().match(/^spoiler\s+(.*)$/);
                        if (tokens[idx].nesting === 1) {
                            return '<details><summary>' + md.utils.escapeHtml(m[1]) + '</summary>\n';
                        } else {
                            return '</details>\n';
                        }
                    }
                });
            }

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
            if (window.markdownitSub) md.use(window.markdownitSub);
            if (window.markdownitIns) md.use(window.markdownitIns);
            if (window.markdownitEmoji) md.use(window.markdownitEmoji);
            if (window.markdownitTaskLists) md.use(window.markdownitTaskLists, { enabled: true });

            // Render content and extract TOC
            const renderContent = () => {
                if (!content.value) {
                    renderedContent.value = '';
                    toc.value = [];
                    return;
                }

                const rendered = md.render(content.value);
                renderedContent.value = rendered;

                // Update DOM
                nextTick(() => {
                    if (previewContent.value) {
                        previewContent.value.innerHTML = rendered;

                        // Render mermaid diagrams
                        if (window.mermaid) {
                            try {
                                window.mermaid.run({
                                    nodes: previewContent.value.querySelectorAll('.mermaid')
                                });
                            } catch (e) {
                                console.error('Mermaid error:', e);
                            }
                        }
                    }

                    // Extract TOC from headings
                    extractToc();
                });
            };

            const extractToc = () => {
                if (!previewContent.value) return;

                const headings = previewContent.value.querySelectorAll('h1, h2, h3');
                const tocItems = [];

                headings.forEach(heading => {
                    if (heading.id) {
                        tocItems.push({
                            id: heading.id,
                            text: heading.textContent.replace(/^#\s*/, ''),
                            level: parseInt(heading.tagName.charAt(1))
                        });
                    }
                });

                toc.value = tocItems;

                // Set first heading as active by default
                if (headings.length > 0) {
                    activeTocId.value = tocItems[0].id;
                }
            };

            const scrollToHeading = (id) => {
                const element = document.getElementById(id);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };

            const handlePreviewScroll = () => {
                if (!previewContainer.value || toc.value.length === 0) return;

                const container = previewContainer.value;
                const scrollTop = container.scrollTop;
                const containerTop = container.getBoundingClientRect().top;

                let activeId = '';
                for (const item of toc.value) {
                    const element = document.getElementById(item.id);
                    if (element) {
                        const rect = element.getBoundingClientRect();
                        if (rect.top <= containerTop + 100) {
                            activeId = item.id;
                        }
                    }
                }

                activeTocId.value = activeId || (toc.value.length > 0 ? toc.value[0].id : '');
            };

            const closeLightbox = () => {
                lightboxImage.value = '';
            };

            // Handle image clicks for lightbox
            const handleImageClick = (e) => {
                if (e.target.tagName === 'IMG' && e.target.closest('.markdown-body')) {
                    lightboxImage.value = e.target.src;
                }
            };

            // Load note by share ID
            const loadNote = async () => {
                loading.value = true;
                error.value = '';

                try {
                    const response = await fetch(`/api/share/${shareId.value}`);
                    if (!response.ok) {
                        const data = await response.json();
                        if (response.status === 401) {
                            window.location.href = '/login?redirect=/s/' + shareId.value;
                            return;
                        }
                        throw new Error(data.error || 'Failed to load');
                    }

                    const note = await response.json();
                    noteId.value = note.id;
                    title.value = note.title || 'Untitled';
                    content.value = note.content || '';
                    noteOwner.value = note.owner;
                    lastEditor.value = note.lastEditor;
                    lastEditedAt.value = note.lastEditedAt;
                    canEdit.value = note.canEdit || note.isOwner;

                    // Store book info for navigation (if note belongs to a book)
                    book.value = note.Book || null;

                    // Update page title
                    document.title = `${title.value} - NoteHubMD`;

                    loading.value = false;

                    // Wait for DOM to update after loading state changes, then render
                    nextTick(() => {
                        renderContent();

                        // Check URL for slide mode
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.get('view') === 'slide') {
                            // Small delay to ensure content is fully rendered
                            setTimeout(() => toggleSlide(), 100);
                        }
                    });
                } catch (e) {
                    // Redirect to 404 if note not found
                    if (e.message.includes('not found') || e.message.includes('Not found')) {
                        window.location.href = '/404';
                        return;
                    }
                    error.value = e.message || '無法載入筆記';
                    loading.value = false;
                }
            };

            // Watch for share ID changes
            watch(shareId, (newId) => {
                if (newId) loadNote();
            }, { immediate: true });

            // Slide Mode
            const showSlide = ref(false);
            let revealInstance = null;

            const toggleSlide = async () => {
                if (showSlide.value) {
                    // Close slide
                    showSlide.value = false;
                    if (revealInstance) {
                        try {
                            revealInstance.destroy();
                            revealInstance = null;
                        } catch (e) {
                            console.warn('Failed to destroy Reveal instance', e);
                        }
                    }
                    // Restore body overflow
                    document.body.style.overflow = '';

                    // Update URL - remove slide parameter
                    const url = new URL(window.location);
                    url.searchParams.delete('view');
                    window.history.replaceState({}, '', url);
                } else {
                    // Open slide
                    showSlide.value = true;
                    // Hide overflow to prevent double scrollbars
                    document.body.style.overflow = 'hidden';

                    // Update URL - add slide parameter
                    const url = new URL(window.location);
                    url.searchParams.set('view', 'slide');
                    window.history.replaceState({}, '', url);

                    await nextTick();

                    const slidesContainer = document.querySelector('.reveal .slides');
                    if (!slidesContainer) return;

                    // Split content into slides
                    // Use regex to split by horizontal rule ---
                    // Note: match newlines around it to be safe
                    const sections = content.value.split(/\n---\n/);

                    let slidesHtml = '';
                    sections.forEach(section => {
                        // Render markdown for each section
                        const rendered = md.render(section);
                        // Wrap in section tag
                        slidesHtml += `<section>${rendered}</section>`;
                    });

                    slidesContainer.innerHTML = slidesHtml;

                    // Initialize Reveal
                    if (window.Reveal) {
                        // If instance exists (shouldn't happen due to logic above), destroy it first
                        if (revealInstance) revealInstance.destroy();

                        revealInstance = new window.Reveal(document.querySelector('.reveal'), {
                            embedded: true, // Use embedded mode since we are in a container (though container is full screen)
                            hash: false,
                            history: false,
                            plugins: [], // we rendered markdown manually
                            slideNumber: true,
                            theme: 'black' // default
                        });

                        revealInstance.initialize().then(() => {
                            // Fix Mermaid in slides if any
                            if (window.mermaid) {
                                window.mermaid.init(undefined, document.querySelectorAll('.reveal .mermaid'));
                            }
                        });
                    }
                }
            };

            // Handle ESC to close slide
            const handleEsc = (e) => {
                if (e.key === 'Escape' && showSlide.value) {
                    toggleSlide();
                }
            };

            onMounted(() => {
                // Initialize Mermaid with theme based on current mode
                if (window.mermaid) {
                    const isDark = document.documentElement.classList.contains('dark');
                    window.mermaid.initialize({
                        startOnLoad: false,
                        theme: isDark ? 'dark' : 'default',
                        securityLevel: 'loose'
                    });
                }

                document.addEventListener('click', handleImageClick);
                document.addEventListener('keyup', handleEsc);
            });

            onUnmounted(() => {
                document.removeEventListener('click', handleImageClick);
                document.removeEventListener('keyup', handleEsc);
                if (revealInstance) revealInstance.destroy();
            });

            return {
                loading,
                error,
                noteId,
                title,
                renderedContent,
                toc,
                activeTocId,
                noteOwner,
                lastEditor,
                relativeLastEditedTime,
                canEdit,
                lightboxImage,
                previewContainer,
                previewContent,
                scrollToHeading,
                handlePreviewScroll,
                closeLightbox,
                // Theme
                theme,
                toggleTheme,
                // Slide
                showSlide,
                toggleSlide,
                // Book navigation
                book,
                bookNotes,
                prevNote,
                nextNote,
                getNoteShareLink
            };
        }
    };

    // Routes
    const routes = [
        { path: '/s/:shareId', component: SharePage, name: 'share' }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes
    });

    // Create and mount app
    const app = createApp({
        data() {
            return {
                modal: {
                    show: false,
                    type: 'alert',
                    message: '',
                    title: '',
                    resolve: null
                }
            };
        },
        methods: {
            closeModal(result) {
                this.modal.show = false;
                if (this.modal.resolve) {
                    this.modal.resolve(result);
                }
            }
        }
    });

    app.use(router);
    setAppInstance(app);
    app.mount('#app');
})();
