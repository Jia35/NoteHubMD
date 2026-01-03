/**
 * Dynamic loading utilities for bundle size optimization
 * These utilities enable lazy loading of heavy dependencies
 */

// ============================================
// Highlight.js Dynamic Loading
// ============================================

// Core hljs instance (loaded on demand)
let hljsCore = null

// Track which languages are already registered
const registeredLanguages = new Set()

// Language aliases mapping
const languageAliases = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'yml': 'yaml',
    'sh': 'bash',
    'shell': 'bash',
    'html': 'xml',
    'htm': 'xml',
    'md': 'markdown',
    'cs': 'csharp',
    'rs': 'rust',
    'kt': 'kotlin',
    'kts': 'kotlin',
    'dockerfile': 'docker',
    'tf': 'hcl',
    'pl': 'perl',
    'pm': 'perl'
}

// Common languages to preload (most frequently used)
const commonLanguages = ['javascript', 'typescript', 'python', 'css', 'xml', 'bash', 'json', 'sql', 'yaml', 'markdown']

/**
 * Get hljs core instance (lazy loaded)
 */
export const getHljsCore = async () => {
    if (!hljsCore) {
        const { default: hljs } = await import('highlight.js/lib/core')
        hljsCore = hljs
    }
    return hljsCore
}

/**
 * Dynamically load and register a highlight.js language
 * @param {string} lang - Language name or alias
 * @returns {Promise<boolean>} - Whether the language was successfully loaded
 */
export const loadHljsLanguage = async (lang) => {
    if (!lang) return false

    const hljs = await getHljsCore()

    // Normalize language name
    const normalizedLang = lang.toLowerCase()
    const actualLang = languageAliases[normalizedLang] || normalizedLang

    // Already registered?
    if (registeredLanguages.has(actualLang)) {
        return true
    }

    // Already in hljs?
    if (hljs.getLanguage(actualLang)) {
        registeredLanguages.add(actualLang)
        return true
    }

    try {
        const module = await import(/* @vite-ignore */ `highlight.js/lib/languages/${actualLang}.js`)
        hljs.registerLanguage(actualLang, module.default)
        registeredLanguages.add(actualLang)

        // Also register aliases
        if (normalizedLang !== actualLang) {
            hljs.registerLanguage(normalizedLang, module.default)
            registeredLanguages.add(normalizedLang)
        }

        return true
    } catch (e) {
        console.warn(`Failed to load highlight.js language: ${actualLang}`, e)
        return false
    }
}

/**
 * Preload common languages for better UX
 */
export const preloadCommonLanguages = async () => {
    const hljs = await getHljsCore()

    await Promise.all(commonLanguages.map(async (lang) => {
        if (!registeredLanguages.has(lang)) {
            try {
                const module = await import(/* @vite-ignore */ `highlight.js/lib/languages/${lang}.js`)
                hljs.registerLanguage(lang, module.default)
                registeredLanguages.add(lang)
            } catch (e) {
                // Ignore errors for preloading
            }
        }
    }))

    // Register aliases for preloaded languages
    Object.entries(languageAliases).forEach(([alias, lang]) => {
        if (registeredLanguages.has(lang) && !registeredLanguages.has(alias)) {
            hljs.registerLanguage(alias, hljs.getLanguage(lang))
            registeredLanguages.add(alias)
        }
    })
}

/**
 * Highlight code with dynamic language loading
 * @param {string} code - Code to highlight
 * @param {string} language - Language name
 * @returns {Promise<string>} - Highlighted HTML
 */
export const highlightCode = async (code, language) => {
    const hljs = await getHljsCore()

    if (language) {
        const loaded = await loadHljsLanguage(language)
        if (loaded) {
            try {
                return hljs.highlight(code, { language, ignoreIllegals: true }).value
            } catch (e) {
                // Fall through to escapeHtml
            }
        }
    }

    // Fallback: escape HTML
    return escapeHtml(code)
}

// ============================================
// CodeMirror Theme Dynamic Loading
// ============================================

// Cache for loaded themes
const loadedThemes = new Map()

// Theme metadata (without actual theme objects)
export const editorThemeList = [
    // Defaults
    { label: '[預設] One Dark', value: 'custom-onedark', type: 'custom' },

    // Dark Themes
    { label: '[深色] Codemirror', value: 'codemirror-default', type: 'builtin' },
    { label: '[深色] Android Studio', value: 'androidstudio', type: 'uiw' },
    { label: '[深色] Atom One', value: 'atomone', type: 'uiw' },
    { label: '[深色] Aura', value: 'aura', type: 'uiw' },
    { label: '[深色] Copilot', value: 'copilot', type: 'uiw' },
    { label: '[深色] Darcula', value: 'darcula', type: 'uiw' },
    { label: '[深色] GitHub Dark', value: 'githubDark', type: 'uiw' },
    { label: '[深色] Gruvbox Dark', value: 'gruvboxDark', type: 'uiw' },
    { label: '[深色] Kimbie', value: 'kimbie', type: 'uiw' },
    { label: '[深色] Material', value: 'material', type: 'uiw' },
    { label: '[深色] Monokai', value: 'monokai', type: 'uiw' },
    { label: '[深色] Monokai Dimmed', value: 'monokaiDimmed', type: 'uiw' },
    { label: '[深色] Okaidia', value: 'okaidia', type: 'uiw' },
    { label: '[深色] One Dark', value: 'oneDark', type: 'cm' },
    { label: '[深色] Solarized Dark', value: 'solarizedDark', type: 'uiw' },
    { label: '[深色] Sublime', value: 'sublime', type: 'uiw' },
    { label: '[深色] Tomorrow Night Blue', value: 'tomorrowNightBlue', type: 'uiw' },
    { label: '[深色] VS Code Dark', value: 'vscodeDark', type: 'uiw' },
    { label: '[深色] Xcode Dark', value: 'xcodeDark', type: 'uiw' },

    // Light Themes
    { label: '[亮色] Eclipse', value: 'eclipse', type: 'uiw' },
    { label: '[亮色] GitHub Light', value: 'githubLight', type: 'uiw' },
    { label: '[亮色] Noctis Lilac', value: 'noctisLilac', type: 'uiw' },
    { label: '[亮色] Quiet Light', value: 'quietlight', type: 'uiw' },
    { label: '[亮色] Solarized Light', value: 'solarizedLight', type: 'uiw' },
    { label: '[亮色] Tokyo Night Day', value: 'tokyoNightDay', type: 'uiw' },
    { label: '[亮色] White', value: 'whiteLight', type: 'uiw' },
    { label: '[亮色] Xcode Light', value: 'xcodeLight', type: 'uiw' },
]

/**
 * Dynamically load a CodeMirror theme
 * @param {string} themeValue - Theme identifier
 * @returns {Promise<Extension[]>} - Theme extension
 */
export const loadEditorTheme = async (themeValue) => {
    // Return cached theme if available
    if (loadedThemes.has(themeValue)) {
        return loadedThemes.get(themeValue)
    }

    let themeExtension = []

    try {
        if (themeValue === 'custom-onedark') {
            // Custom theme
            const { customOneDark } = await import('@/themes/custom-onedark.js')
            themeExtension = customOneDark
        } else if (themeValue === 'codemirror-default') {
            // No theme extension needed
            themeExtension = []
        } else if (themeValue === 'oneDark') {
            // Official CodeMirror theme
            const { oneDark } = await import('@codemirror/theme-one-dark')
            themeExtension = oneDark
        } else {
            // UIW themes - import individually to avoid circular dependency issues
            // Map theme values to their module names
            const themeModuleMap = {
                'androidstudio': () => import('@uiw/codemirror-theme-androidstudio').then(m => m.androidstudio),
                'atomone': () => import('@uiw/codemirror-theme-atomone').then(m => m.atomone),
                'aura': () => import('@uiw/codemirror-theme-aura').then(m => m.aura),
                'copilot': () => import('@uiw/codemirror-theme-copilot').then(m => m.copilot),
                'darcula': () => import('@uiw/codemirror-theme-darcula').then(m => m.darcula),
                'githubDark': () => import('@uiw/codemirror-theme-github').then(m => m.githubDark),
                'githubLight': () => import('@uiw/codemirror-theme-github').then(m => m.githubLight),
                'gruvboxDark': () => import('@uiw/codemirror-theme-gruvbox-dark').then(m => m.gruvboxDark),
                'kimbie': () => import('@uiw/codemirror-theme-kimbie').then(m => m.kimbie),
                'material': () => import('@uiw/codemirror-theme-material').then(m => m.material),
                'monokai': () => import('@uiw/codemirror-theme-monokai').then(m => m.monokai),
                'monokaiDimmed': () => import('@uiw/codemirror-theme-monokai-dimmed').then(m => m.monokaiDimmed),
                'okaidia': () => import('@uiw/codemirror-theme-okaidia').then(m => m.okaidia),
                'solarizedDark': () => import('@uiw/codemirror-theme-solarized').then(m => m.solarizedDark),
                'solarizedLight': () => import('@uiw/codemirror-theme-solarized').then(m => m.solarizedLight),
                'sublime': () => import('@uiw/codemirror-theme-sublime').then(m => m.sublime),
                'tomorrowNightBlue': () => import('@uiw/codemirror-theme-tomorrow-night-blue').then(m => m.tomorrowNightBlue),
                'vscodeDark': () => import('@uiw/codemirror-theme-vscode').then(m => m.vscodeDark),
                'xcodeDark': () => import('@uiw/codemirror-theme-xcode').then(m => m.xcodeDark),
                'xcodeLight': () => import('@uiw/codemirror-theme-xcode').then(m => m.xcodeLight),
                'eclipse': () => import('@uiw/codemirror-theme-eclipse').then(m => m.eclipse),
                'noctisLilac': () => import('@uiw/codemirror-theme-noctis-lilac').then(m => m.noctisLilac),
                'quietlight': () => import('@uiw/codemirror-theme-quietlight').then(m => m.quietlight),
                'tokyoNightDay': () => import('@uiw/codemirror-theme-tokyo-night-day').then(m => m.tokyoNightDay),
                'whiteLight': () => import('@uiw/codemirror-theme-white').then(m => m.whiteLight),
            }

            if (themeModuleMap[themeValue]) {
                themeExtension = await themeModuleMap[themeValue]()
            }
        }
    } catch (e) {
        console.warn(`Failed to load editor theme: ${themeValue}`, e)
        themeExtension = []
    }

    // Cache the loaded theme
    loadedThemes.set(themeValue, themeExtension)

    return themeExtension
}

// ============================================
// KaTeX Dynamic Loading
// ============================================

let katexPluginLoaded = false
let katexMd = null

/**
 * Check if content contains math expressions
 * @param {string} content - Markdown content
 * @returns {boolean}
 */
export const contentHasMath = (content) => {
    if (!content) return false
    // Check for common math delimiters: $...$, $$...$$, \(...\), \[...\]
    return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\[\[\(][\s\S]+?\\[\]\)]/.test(content)
}

/**
 * Load KaTeX plugin and CSS
 * @param {object} md - markdown-it instance
 * @returns {Promise<void>}
 */
export const loadKatexPlugin = async (md) => {
    if (katexPluginLoaded) {
        return
    }

    try {
        // Load KaTeX CSS
        const katexCss = await import('katex/dist/katex.min.css?inline')

        // Inject CSS if not already present
        if (!document.getElementById('katex-css')) {
            const style = document.createElement('style')
            style.id = 'katex-css'
            style.textContent = katexCss.default
            document.head.appendChild(style)
        }

        // Load and apply the plugin (using @mdit/plugin-katex for modern KaTeX support)
        const { katex: katexPlugin } = await import('@mdit/plugin-katex')
        md.use(katexPlugin)

        katexPluginLoaded = true
    } catch (e) {
        console.warn('Failed to load KaTeX:', e)
    }
}


/**
 * Get or create a markdown-it instance with KaTeX support
 * Call this when you detect math content
 */
export const ensureKatexLoaded = async (md, content) => {
    if (contentHasMath(content) && !katexPluginLoaded) {
        await loadKatexPlugin(md)
    }
}

// ============================================
// Mermaid Dynamic Loading
// ============================================

let mermaidInstance = null

/**
 * Check if content contains mermaid diagrams
 * @param {string} content - Markdown content
 * @returns {boolean}
 */
export const contentHasMermaid = (content) => {
    if (!content) return false
    return /```mermaid/i.test(content)
}

/**
 * Dynamically load and initialize mermaid
 * @param {boolean} isDark - Whether dark theme is active
 * @returns {Promise<object>} - The mermaid instance
 */
export const loadMermaid = async (isDark = false) => {
    if (!mermaidInstance) {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'default',
            securityLevel: 'loose',
            fontFamily: 'inherit'
        })
        mermaidInstance = mermaid
    } else {
        // Re-initialize with updated theme
        mermaidInstance.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'default',
            securityLevel: 'loose',
            fontFamily: 'inherit'
        })
    }
    return mermaidInstance
}

// ============================================
// Utility Functions
// ============================================

/**
 * Escape HTML entities
 */
export const escapeHtml = (str) => {
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }
    return str.replace(/[&<>"']/g, char => htmlEscapes[char])
}
