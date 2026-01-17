<script setup>
/**
 * NoteView - 筆記編輯頁 (完整版)
 * 使用 CodeMirror 6 編輯器與 markdown-it 渲染器
 */
import { ref, computed, onMounted, onUnmounted, inject, watch, nextTick, shallowRef, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import morphdom from 'morphdom'
import api from '@/composables/useApi'
import { useSocket } from '@/composables/useSocket'
import { useYjsAwareness } from '@/composables/useYjsAwareness'
import dayjs from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'
import { copyToClipboard } from '@/utils/clipboard'

dayjs.extend(relativeTimePlugin)
dayjs.locale('zh-tw')

// Components
import { SidebarNav, InfoModal, SettingsModal, AboutModal, CreateBookModal, RevisionsModal, ImageLightbox } from '@/components'
import CommentSection from '@/components/common/CommentSection.vue'
import NoteReactions from '@/components/common/NoteReactions.vue'
// AI Assistant - dynamically loaded only when AI is enabled
const AiAssistantButton = defineAsyncComponent(() => 
  import('@/components/common/AiAssistantButton.vue')
)
const AiAssistantChat = defineAsyncComponent(() => 
  import('@/components/common/AiAssistantChat.vue')
)

// CodeMirror 6
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter, WidgetType, Decoration, ViewPlugin } from '@codemirror/view'
import { EditorState, Compartment, StateField, StateEffect } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { foldGutter, foldKeymap } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, undo, redo, indentWithTab } from '@codemirror/commands'
import { autocompletion } from '@codemirror/autocomplete'
// CodeMirror themes - loaded dynamically for bundle size optimization
// Import only the official one-dark as fallback (it's small and commonly used)
import { oneDark } from '@codemirror/theme-one-dark'

// Dynamic loaders for bundle optimization
import { loadEditorTheme, editorThemeList, loadMermaid, loadKatexPlugin, contentHasMath } from '@/composables/useDynamicLoaders'

// Markdown-it
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import markdownItIns from 'markdown-it-ins'
import markdownItContainer from 'markdown-it-container'
import markdownItImsize from 'markdown-it-imsize/dist/markdown-it-imsize.min.js'
// KaTeX - loaded dynamically when math content is detected
// import markdownItKatex from 'markdown-it-katex'
// import 'katex/dist/katex.min.css'
import { tab as markdownItTab } from '@mdit/plugin-tab'
import { imgLazyload } from '@mdit/plugin-img-lazyload'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItAbbr from 'markdown-it-abbr'
import markdownItTaskLists from 'markdown-it-task-lists'

// Note: mermaid, KaTeX, and CodeMirror themes are loaded dynamically via useDynamicLoaders

// Highlight.js
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import hljsMarkdown from 'highlight.js/lib/languages/markdown'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import php from 'highlight.js/lib/languages/php'
import rust from 'highlight.js/lib/languages/rust'
import hljsGithubDark from 'highlight.js/styles/github-dark.css?inline'
import hljsGithubLight from 'highlight.js/styles/github.css?inline'

// Register languages
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', hljsMarkdown)
hljs.registerLanguage('md', hljsMarkdown)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('php', php)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)

const route = useRoute()
const router = useRouter()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// Note data
const note = ref(null)
const book = ref(null)
const loading = ref(true)
const saving = ref(false)
const lastSaved = ref(null)

// Time formatting
const getRelativeTime = (time) => {
  if (!time) return ''
  return dayjs(time).fromNow()
}
const content = ref('')

// User & permissions
const currentUser = ref(null)
const isOwner = ref(false)
const canEdit = ref(false)
const permission = ref('private')

// View mode
// View mode
const getInitialMode = () => {
  if (route.query.edit !== undefined) return 'edit'
  if (route.query.view !== undefined) return 'view'
  if (route.query.both !== undefined) return 'both'
  return 'both' // Default
}
const mode = ref(getInitialMode())

watch(mode, (newMode) => {
  const query = { ...route.query }
  delete query.edit
  delete query.view
  delete query.both
  query[newMode] = null
  router.replace({ query })
})
const showSidebar = ref(false)
const editorWidth = ref(50)

// Editor
const editorContainer = ref(null)
const previewContainer = ref(null)
const previewContent = ref(null)
const editorView = shallowRef(null)
const renderedContent = ref('')
const showFloatingToc = ref(false)

const toggleFloatingToc = () => {
  showFloatingToc.value = !showFloatingToc.value
}

const scrollToHeadingAndCloseToc = (id) => {
  scrollToHeading(id)
  showFloatingToc.value = false
}

// Stats
const charCount = computed(() => content.value.length)
const lineCount = computed(() => content.value.split('\n').length)
const selectedLines = ref(0)
const selectedChars = ref(0)
const isSyncingLeft = ref(false)
const isSyncingRight = ref(false)
const hasUnsavedChanges = ref(false)

// Socket
const { socket, joinNote, leaveNote, editNote, onNoteUpdated, offNoteUpdated, onUsersInNote, offUsersInNote, onPermissionChanged, offPermissionChanged } = useSocket()
const onlineUsers = ref([])
const showOnlineUsersPopup = ref(false)

// Sidebar data
const books = ref([])
// [DISABLED] 釘選功能暫時停用
// const pinnedItems = ref([])
const pinnedItems = ref([]) // 空陣列代替，避免模板報錯
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')

// Modals
const showSettingsModal = ref(false)
const settingsInitialTab = ref('')
const showAboutModal = ref(false)
const showCreateBookModal = ref(false)
const showNoteInfoModal = ref(false)
const showRevisionsModal = ref(false)
const showExportModal = ref(false)
const noteInfoModalTab = ref('info')

// Settings
const theme = ref(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
const appVersion = ref('')

// Toggle theme (light/dark)
const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('NoteHubMD-theme', theme.value)
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
}

// Editor Theme - using dynamic loader from composable
// editorThemeList is imported from useDynamicLoaders
const selectedEditorTheme = ref(localStorage.getItem('NoteHubMD-editorTheme') || (theme.value === 'dark' ? 'custom-onedark' : 'githubLight'))
const themeCompartment = new Compartment()
const currentThemeExtension = shallowRef(oneDark) // Default fallback

// Watch for theme changes and dynamically load the new theme
watch(selectedEditorTheme, async (newVal) => {
  localStorage.setItem('NoteHubMD-editorTheme', newVal)
  if (editorView.value) {
    try {
      const themeExtension = await loadEditorTheme(newVal)
      currentThemeExtension.value = themeExtension
      editorView.value.dispatch({
        effects: themeCompartment.reconfigure(themeExtension)
      })
    } catch (e) {
      console.warn('Failed to load theme:', e)
    }
  }
})



// Permission options
const permissionOptions = [
  { value: 'public-edit', label: '可編輯' },
  { value: 'auth-edit', label: '可編輯(需登入)' },
  { value: 'public-view', label: '唯讀' },
  { value: 'auth-view', label: '唯讀(需登入)' },
  { value: 'private', label: '私人' },
  { value: 'inherit', label: '繼承書本' }
]

// Comments - now handled by CommentSection component
const noteCommentsEnabled = ref(true)

// AI Assistant - check enabled status before loading component
const aiEnabled = ref(false)
const hideAiFloatingButton = ref(localStorage.getItem('NoteHubMD-hideAiFloatingButton') === 'true')
const showAiChatFromMenu = ref(false)
const featureConfig = ref({ comments: true, noteReactions: true })

// Check if AI is enabled (called after page load to avoid blocking)
const checkAiEnabled = async () => {
  try {
    const settings = await api.getAiSettings()
    aiEnabled.value = settings.enabled
  } catch (e) {
    // AI not enabled or error checking
    aiEnabled.value = false
  }
}

// Handle storage event for cross-tab sync of AI button visibility
const handleStorageChange = (e) => {
  if (e.key === 'NoteHubMD-hideAiFloatingButton') {
    hideAiFloatingButton.value = e.newValue === 'true'
  }
}

// Note owner/editor info
const noteOwner = ref(null)
const lastEditor = ref(null)
const lastContentEditedAt = ref(null)
const noteCreatedAt = ref(null)

// TOC
const toc = ref([])
const activeHeadingId = ref(null)
let tocObserver = null

// Resizable
const isResizing = ref(false)
const contentArea = ref(null)

// Yjs Awareness (Cursor Sharing)
const { 
  updateCursor: updateYjsCursor, 
  destroy: destroyYjs, 
  onCursorsChange: onYjsCursorsChange 
} = { updateCursor: () => {}, destroy: () => {}, onCursorsChange: () => {} } // Placeholder until init

const yjsInstance = shallowRef(null)
const remoteCursors = shallowRef(new Map())

// Info modal data
const userPermissions = ref([])
const loadingUserPermissions = ref(false)
const userSearchQuery = ref('')
const userSearchResults = ref([])
const newUserPermission = ref('view')
const showNoteMenu = ref(false)

// Computed
const showEditor = computed(() => mode.value === 'edit' || mode.value === 'both')
const showPreview = computed(() => mode.value === 'view' || mode.value === 'both')
const currentRoute = computed(() => '/n/' + route.params.id)
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return books.value.filter(b => b.isOwner)
  }
  return books.value.filter(b => b.isPublic)
})

const noteInfoItem = computed(() => ({
  ...note.value,
  isOwner: isOwner.value,
  canEdit: canEdit.value,
  charCount: charCount.value,
  lineCount: lineCount.value
}))

// Parse extended code block syntax: language + modifiers (!, =, =N)
// Examples: python!, javascript=, python!=30, =10
const parseCodeBlockInfo = (info) => {
  const result = {
    language: '',
    wordWrap: false,
    lineNumbers: false,
    startLine: 1
  }

  if (!info) return result

  // Match pattern: [language][!][=][startLineNumber]
  // Examples: python, python!, python=, python=10, python!=, python!=10, !=, =10, !
  const match = info.match(/^([a-zA-Z0-9_+-]*)(!?)(=?)(\d*)$/)
  if (match) {
    result.language = match[1] || ''
    result.wordWrap = match[2] === '!'
    result.lineNumbers = match[3] === '='
    if (match[4]) {
      result.startLine = parseInt(match[4], 10)
      result.lineNumbers = true // If start number specified, enable line numbers
    }
  } else {
    // Fallback: treat as language only
    result.language = info
  }

  return result
}

// --- Yjs Cursor Implementation for CodeMirror ---

// 1. Define StateEffect for updating cursors
const updateCursorsEffect = StateEffect.define()

// 2. Define Cursor Widget
class RemoteCursorWidget extends WidgetType {
  constructor(color, name) {
    super()
    this.color = color
    this.name = name
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-y-cursor'
    el.style.borderLeftColor = this.color
    
    // Name tag
    const label = document.createElement('div')
    label.className = 'cm-y-cursor-label'
    label.style.backgroundColor = this.color
    label.textContent = this.name
    el.appendChild(label)
    
    return el
  }
}

// 3. Define StateField to manage decorations
const cursorField = StateField.define({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    // Map existing decorations to changes (so they move with text)
    decorations = decorations.map(tr.changes)
    
    // Check for cursor update effects
    for (let e of tr.effects) {
      if (e.is(updateCursorsEffect)) {
        // e.value is the array of cursors: [clientId, { index, username, color }]
        const cursors = e.value
        const widgets = []
        
        for (const [clientId, cursor] of cursors) {
          if (cursor.index !== undefined && cursor.index <= tr.state.doc.length) {
             const widget = Decoration.widget({
               widget: new RemoteCursorWidget(cursor.color, cursor.username),
               side: 0
             })
             widgets.push(widget.range(cursor.index))
          }
        }
        decorations = Decoration.set(widgets)
      }
    }
    return decorations
  },
  provide: f => EditorView.decorations.from(f)
})

// 4. Base Theme
const cursorTheme = EditorView.baseTheme({
  ".cm-y-cursor": {
    position: "relative",
    borderLeft: "2px solid",
    marginLeft: "-1px",
    height: "1.2em",
    display: "inline-block",
    verticalAlign: "text-top"
  },
  ".cm-y-cursor-label": {
    position: "absolute",
    top: "-1.4em",
    left: "-2px",
    fontSize: "12px",
    color: "white",
    padding: "2px 4px",
    borderRadius: "4px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 10,
    opacity: 0,
    transition: "opacity 0.2s"
  },
  ".cm-y-cursor:hover .cm-y-cursor-label": {
    opacity: 1
  }
})

const cursorExtension = [cursorField, cursorTheme]

// Plugin for colored blockquotes (CodiMD style)
const blockquoteColorPlugin = (md) => {
  md.core.ruler.push('blockquote_color', (state) => {
    const tokens = state.tokens
    const stack = []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]

      if (token.type === 'blockquote_open') {
        stack.push(token)
      } else if (token.type === 'blockquote_close') {
        stack.pop()
      } else if (token.type === 'inline' && stack.length > 0) {
        const text = token.content
        const match = text.match(/\[color=(.*?)\]/)
        if (match) {
          const color = match[1]
          const currentBlockquote = stack[stack.length - 1]
          
          // Apply style
          const existingStyle = currentBlockquote.attrGet('style') || ''
          currentBlockquote.attrSet('style', existingStyle + `border-left-color: ${color};`)
          
          // Remove tag from content
          token.content = text.replace(match[0], '')
          
          // Also check children (text nodes) to update displayed text
          if (token.children) {
            token.children.forEach(child => {
              if (child.type === 'text' && child.content.includes(match[0])) {
                child.content = child.content.replace(match[0], '')
              }
            })
          }
        }
      }
    }
  })
}

// Markdown-it setup
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  breaks: true
})

// Custom fence renderer to support language headers and wrappers
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : ''
  const content = token.content

  const parsed = parseCodeBlockInfo(info)
  const actualLang = parsed.language.toLowerCase()

  // Handle mermaid code blocks specially
  if (actualLang === 'mermaid') {
    return '<div class="mermaid">' + content + '</div>'
  }

  // Build CSS classes
  const classes = ['hljs']
  if (parsed.wordWrap) classes.push('code-wrap')
  if (parsed.lineNumbers) classes.push('has-line-numbers')
  if (actualLang) classes.push('language-' + actualLang)

  let highlightedCode
  if (parsed.language && hljs.getLanguage(parsed.language)) {
    try {
      highlightedCode = hljs.highlight(content, { language: parsed.language, ignoreIllegals: true }).value
    } catch {
      highlightedCode = md.utils.escapeHtml(content)
    }
  } else {
    highlightedCode = md.utils.escapeHtml(content)
  }

  let finalCodeHtml = highlightedCode

  // If line numbers are enabled, wrap with line number display
  if (parsed.lineNumbers) {
    const lines = highlightedCode.split('\n')
    // Remove trailing empty line if present
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    const lineNumbersHtml = lines.map((_, i) =>
      `<span class="code-line-number">${parsed.startLine + i}</span>`
    ).join('')

    const codeHtml = lines.map(line =>
      `<span class="code-line">${line || ' '}</span>`
    ).join('')

    finalCodeHtml = `<div class="code-line-numbers">${lineNumbersHtml}</div><div class="code-content">${codeHtml}</div>`
  }

  // Construct HTML with copy button
  // Escape content for data attribute (remove newlines and encode)
  const escapedContent = content.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const copyBtnHtml = `<button class="code-copy-btn" data-code="${escapedContent}" title="複製程式碼"><i class="fa-regular fa-copy"></i></button>`
  
  let output = '<div class="code-block-wrapper">'
  
  // Add header with language and copy button
  output += `<div class="code-block-header"><span class="code-lang">${actualLang ? actualLang : 'code'}</span>${copyBtnHtml}</div>`

  output += `<pre class="${classes.join(' ')}"><code>${finalCodeHtml}</code></pre>`
  output += '</div>'

  return output
}

md.use(markdownItAnchor, { permalink: false })
  .use(markdownItEmoji)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItIns)
  .use(markdownItTaskLists, { enabled: true, label: true })
  .use(markdownItImsize)
  .use(blockquoteColorPlugin)
  // KaTeX is loaded dynamically in renderMarkdown when math content is detected
  .use(markdownItTab, {
    name: 'tabs',
    openRender: (info) => {
      const tabButtons = info.data.map((t, i) => 
        `<button class="tab-btn${t.isActive ? ' active' : ''}" data-tab-index="${i}">${t.title}</button>`
      ).join('')
      return `<div class="tabs-container"><div class="tabs-header">${tabButtons}</div>`
    },
    closeRender: () => '</div>',
    tabOpenRender: (data) => `<div class="tab-content${data.isActive ? ' active' : ''}" data-tab-index="${data.index}">`,
    tabCloseRender: () => '</div>'
  })
  .use(imgLazyload)
  .use(markdownItFootnote)
  .use(markdownItAbbr)

// Containers
;['success', 'info', 'warning', 'danger'].forEach(type => {
  md.use(markdownItContainer, type, {
    render: function (tokens, idx) {
      const m = tokens[idx].info.trim().match(new RegExp(`^${type}\\s*(.*)$`))
      if (tokens[idx].nesting === 1) {
        return '<div class="alert alert-' + type + '">\n' +
          (m[1] ? '<strong>' + md.utils.escapeHtml(m[1]) + '</strong>' : '')
      } else {
        return '</div>\n'
      }
    }
  })
})
// Spoiler
md.use(markdownItContainer, 'spoiler', {
  validate: function (params) {
    return params.trim().match(/^spoiler\s+(.*)$/)
  },
  render: function (tokens, idx) {
    var m = tokens[idx].info.trim().match(/^spoiler\s+(.*)$/)
    if (tokens[idx].nesting === 1) {
      return '<details><summary>' + md.utils.escapeHtml(m[1]) + '</summary>\n'
    } else {
      return '</details>\n'
    }
  }
})

// Load note
const loadNote = async () => {
  loading.value = true
  try {
    currentUser.value = await api.getMe().catch(() => null)
    
    const [booksData, pinnedData, versionData] = await Promise.all([
      api.getBooks().catch(() => []),
      // [DISABLED] 釘選功能暫時停用
      // api.getPinnedItems().catch(() => []),
      Promise.resolve([]), // 空陣列代替
      api.getAppVersion().catch(() => ({ version: '' }))
    ])
    books.value = booksData
    // [DISABLED] 釘選功能暫時停用
    // pinnedItems.value = pinnedData
    appVersion.value = versionData.version || ''
    
    const data = await api.getNote(route.params.id)
    note.value = data
    content.value = data.content || ''
    isOwner.value = data.isOwner || false
    canEdit.value = data.canEdit || false
    permission.value = data.permission || 'private'
    noteCommentsEnabled.value = data.commentsEnabled !== false
    noteOwner.value = data.owner || null
    lastEditor.value = data.lastEditor || null
    lastContentEditedAt.value = data.lastContentEditedAt || data.updatedAt || null
    noteCreatedAt.value = data.createdAt || null
    
    // Load global feature config
    try {
      featureConfig.value = await api.getFeatureConfig()
      // console.log('Feature Config Loaded:', featureConfig.value)
    } catch (e) {
      console.error('Failed to load feature config:', e)
      // Keep defaults if fetch fails
    }
    
    // Fetch book with Notes if note belongs to a book
    if (data.bookId) {
      try {
        book.value = await api.getBook(data.bookId)
      } catch {
        book.value = data.book || null
      }
    } else {
      book.value = null
    }
    
    document.title = `${(data.title || 'Untitled').substring(0, 20)} | NoteHubMD`
    
    // renderMarkdown will be called in finally block after DOM update
    
    // Always initialize editor (with edit blocking if no permission)
    // Delay editor init to ensure DOM is ready
    nextTick(() => {
      setTimeout(() => {
        initEditor()
      }, 100)
    })
    
    // Comments are now loaded by CommentSection component
  } catch (e) {
    console.error('Failed to load note:', e)
    if (e.message?.includes('Login required')) {
      showAlert?.('需要登入才能存取此筆記', 'error')
      router.push('/login?redirect=' + encodeURIComponent(route.fullPath))
      return
    } else if (e.message?.includes('Access denied')) {
      showAlert?.('您沒有權限存取此筆記', 'error')
      router.push('/')
      return
    } else if (e.message?.includes('not found')) {
      window.location.href = '/404'
      return
    }
    showAlert?.('載入筆記失敗', 'error')
  } finally {
    loading.value = false
    
    // Check AI enabled status (non-blocking)
    checkAiEnabled()
    
    // Ensure DOM is updated before rendering markdown (specifically for TOC generation which needs elements)
    nextTick(() => {
      renderMarkdown()
    })
    
    if (note.value) {
      const username = currentUser.value?.username || 'Guest'
      const name = currentUser.value?.name || null
      joinNote(note.value.id, username, name)
      
      onUsersInNote((users) => {
        // Deduplicate users by username (except 'Guest')
        const uniqueUsers = []
        const seenUsernames = new Set()
        
        users.forEach(user => {
          const name = user.username || 'Guest'
          if (name === 'Guest') {
            uniqueUsers.push(user)
          } else {
            if (!seenUsernames.has(name)) {
              seenUsernames.add(name)
              uniqueUsers.push(user)
            }
          }
        })
        onlineUsers.value = uniqueUsers
      })
      
      // Initialize Yjs Awareness
      if (!yjsInstance.value) {
         try {
           const yjs = useYjsAwareness(note.value.id, username || 'Guest')
           yjsInstance.value = yjs
           
           // Watch for remote cursor changes and dispatch to CodeMirror
           yjs.onCursorsChange((cursors) => {
             // cursors is array of [clientId, data]
             if (editorView.value) {
               // Only show cursors for users who are in the online list
               const onlineUsernames = new Set(onlineUsers.value.map(u => u.username))
               const filteredCursors = cursors.filter(([clientId, cursor]) => 
                 onlineUsernames.has(cursor.username)
               )
               
               editorView.value.dispatch({
                 effects: updateCursorsEffect.of(filteredCursors)
               })
             }
           })
           
           // If we have a name/color update, make sure to set it
           // (useYjsAwareness does this in init, but we can verify)
         } catch (e) {
           console.error('Failed to init Yjs Awareness:', e)
         }
      }

      onNoteUpdated((newContent) => {
        if (newContent !== content.value && editorView.value) {
          content.value = newContent
          const currentDoc = editorView.value.state.doc.toString()
          if (currentDoc !== newContent) {
            editorView.value.dispatch({
              changes: { from: 0, to: currentDoc.length, insert: newContent }
            })
          }
          renderMarkdown()
        }
      })
      
      // Listen for permission changes (e.g., owner changes permission from edit to view)
      onPermissionChanged(async (data) => {
        if (data.noteId === note.value?.id) {
          permission.value = data.permission
          // Re-check canEdit based on new permission
          const newPermission = data.permission
          // Only owner or users with 'edit' override can edit private/view-only notes
          // For simplicity, refetch the note to get accurate canEdit
          try {
            const refreshedData = await api.getNote(note.value.id)
            canEdit.value = refreshedData.canEdit || false
            if (!canEdit.value) {
              showAlert?.('權限已變更，您現在為唯讀模式', 'warning')
            }
          } catch (e) {
            // If access denied, redirect
            if (e.message?.includes('Access denied') || e.message?.includes('Login required')) {
              showAlert?.('您已失去此筆記的存取權限', 'error')
              router.push('/')
            }
          }
        }
      })
    }
  }
}

// --- Markdown Autocomplete Hints ---
const markdownHints = [
  // Headings
  { text: '# ', displayText: '# 標題 1', trigger: '#' },
  { text: '## ', displayText: '## 標題 2', trigger: '#' },
  { text: '### ', displayText: '### 標題 3', trigger: '#' },
  { text: '#### ', displayText: '#### 標題 4', trigger: '#' },
  { text: '##### ', displayText: '##### 標題 5', trigger: '#' },
  { text: '###### ', displayText: '###### 標題 6', trigger: '#' },
  { text: "###### tags: `標籤1`、`標籤2`、`標籤3`", displayText: "###### tags: `標籤1`、`標籤2`...", trigger: '#' },
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
]

const markdownCompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos)
  const lineStart = line.text.substring(0, context.pos - line.from)
  
  let matchingHints = []
  let from = line.from
  
  // Check for heading pattern at line start
  const headingMatch = lineStart.match(/^(#{1,6})$/)
  if (headingMatch) {
    from = line.from
    const prefix = headingMatch[1]
    matchingHints = markdownHints.filter(h => h.trigger === '#' && h.text.startsWith(prefix))
  }
  
  // Check for container pattern at line start
  const containerMatch = lineStart.match(/^(:{1,3})$/)
  if (containerMatch) {
    from = line.from
    matchingHints = markdownHints.filter(h => h.trigger === ':::')
  }
  
  // Check for code block pattern at line start
  const codeMatch = lineStart.match(/^(`{1,3})$/)
  if (codeMatch) {
    from = line.from
    matchingHints = markdownHints.filter(h => h.trigger === '`')
  }
  
  // Check for list pattern at line start
  const listMatch = lineStart.match(/^(-)$/)
  if (listMatch) {
    from = line.from
    matchingHints = markdownHints.filter(h => h.trigger === '-')
  }
  
  // Check for link pattern
  const linkMatch = lineStart.match(/(\[)$/)
  if (linkMatch) {
    from = context.pos - 1
    matchingHints = markdownHints.filter(h => h.trigger === '[')
  }
  
  // Check for image pattern
  const imageMatch = lineStart.match(/(!)$/)
  if (imageMatch) {
    from = context.pos - 1
    matchingHints = markdownHints.filter(h => h.trigger === '!')
  }
  
  // Check for bold/italic pattern
  const boldMatch = lineStart.match(/(\*{1,2})$/)
  if (boldMatch) {
    from = context.pos - boldMatch[1].length
    matchingHints = markdownHints.filter(h => h.trigger === '*')
  }
  
  // Check for strikethrough pattern
  const strikeMatch = lineStart.match(/(~{1,2})$/)
  if (strikeMatch) {
    from = context.pos - strikeMatch[1].length
    matchingHints = markdownHints.filter(h => h.trigger === '~')
  }
  
  // Check for mark pattern
  const markMatch = lineStart.match(/(={1,2})$/)
  if (markMatch) {
    from = context.pos - markMatch[1].length
    matchingHints = markdownHints.filter(h => h.trigger === '=')
  }
  
  // Check for superscript pattern
  const supMatch = lineStart.match(/(\^)$/)
  if (supMatch) {
    from = context.pos - 1
    matchingHints = markdownHints.filter(h => h.trigger === '^')
  }
  
  // Check for table pattern
  const tableMatch = lineStart.match(/(\|)$/)
  if (tableMatch) {
    from = context.pos - 1
    matchingHints = markdownHints.filter(h => h.trigger === '|')
  }
  
  if (matchingHints.length === 0) return null
  
  return {
    from,
    options: matchingHints.map(hint => ({
      label: hint.displayText,
      apply: hint.text
    })),
    filter: false
  }
}

// Init CodeMirror - async to support dynamic theme loading
const initEditor = async () => {
  if (!editorContainer.value) {
    console.warn('Editor container not found, retrying...')
    setTimeout(initEditor, 100)
    return
  }
  if (editorView.value) return
  
  const isDark = document.documentElement.classList.contains('dark')
  
  // Dynamically load the selected theme
  let themeExtension = oneDark // Default fallback
  try {
    themeExtension = await loadEditorTheme(selectedEditorTheme.value)
    currentThemeExtension.value = themeExtension
  } catch (e) {
    console.warn('Failed to load initial theme, using default:', e)
  }
  
  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages
    }),
    placeholder('開始編輯筆記...'),
    foldGutter(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    EditorView.lineWrapping,
    themeCompartment.of(themeExtension),
    // Edit filter: block edits and show alert if no permission
    EditorState.transactionFilter.of((tr) => {
      if (!canEdit.value && tr.docChanged) {
        showAlert?.('您沒有編輯權限', 'error')
        return []
      }
      return tr
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        hasUnsavedChanges.value = true
        content.value = update.state.doc.toString()
        debouncedSave()
        debouncedRender()
        if (note.value) {
          editNote(note.value.id, content.value)
        }
      }
      
      if (update.selectionSet) {
        const selection = update.state.selection.main
        selectedChars.value = selection.to - selection.from
        if (selectedChars.value > 0) {
          const startLine = update.state.doc.lineAt(selection.from).number
          const endLine = update.state.doc.lineAt(selection.to).number
          selectedLines.value = endLine - startLine + 1
        } else {
          selectedLines.value = 0
        }
        
        // Broadcast cursor position via Yjs
        if (yjsInstance.value) {
           // We send the head (cursor position) and anchor (selection start)
           // Format: { index: number, anchor: number }
           yjsInstance.value.updateCursor({
             index: selection.head,
             anchor: selection.anchor
           })
        }
      }
    }),
    // Remote Cursors Extension
    cursorExtension,
    EditorView.domEventHandlers({
      scroll: (event, view) => {
        if (!isSyncingLeft.value) {
          isSyncingRight.value = true
          syncScrollFromEditor(event.target)
          isSyncingRight.value = false
        }
      },
      paste: handlePaste,
      drop: handleDrop
    }),
    autocompletion({
      override: [markdownCompletionSource],
      activateOnTyping: true
    })
  ]
  

  
  editorView.value = new EditorView({
    state: EditorState.create({
      doc: content.value,
      extensions
    }),
    parent: editorContainer.value
  })
  
  // Reset dirty state after initialization
  hasUnsavedChanges.value = false
}

// Render markdown and generate TOC
let renderTimeout = null
const debouncedRender = () => {
  if (renderTimeout) clearTimeout(renderTimeout)
  renderTimeout = setTimeout(() => {
    renderMarkdown()
  }, 300)
}

const renderMarkdown = async () => {
  // Conditionally load KaTeX if math content is detected
  if (contentHasMath(content.value)) {
    await loadKatexPlugin(md)
  }
  
  const newHtml = md.render(content.value)
  
  if (previewContent.value) {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = newHtml
    morphdom(previewContent.value, tempDiv, { childrenOnly: true })
  }
  
  // renderedContent.value = newHtml // No longer driving the view
  
  // Generate TOC from headings and render mermaid diagrams
  nextTick(async () => {
    if (previewContent.value) {
      const headings = previewContent.value.querySelectorAll('h1, h2, h3')
      toc.value = Array.from(headings).map((h, idx) => ({
        id: h.id || `heading-${idx}`,
        text: h.textContent,
        level: parseInt(h.tagName[1])
      }))
      
      // Ensure all headings have IDs
      headings.forEach((h, idx) => {
        if (!h.id) h.id = `heading-${idx}`
      })
      
      // Set initial active heading if none or at top
      if (toc.value.length > 0) {
        // If at top or no active heading, default to first
        if (!activeHeadingId.value || (previewContainer.value && previewContainer.value.scrollTop < 30)) {
          activeHeadingId.value = toc.value[0].id
        }
      }

      setupIntersectionObserver()
      
      // Render mermaid diagrams (dynamically loaded)
      const mermaidDivs = previewContent.value.querySelectorAll('.mermaid')
      if (mermaidDivs.length > 0) {
        try {
          // Dynamically load mermaid only when needed
          const isDark = document.documentElement.classList.contains('dark')
          const mermaid = await loadMermaid(isDark)
          await new Promise(resolve => setTimeout(resolve, 50))
          await mermaid.run({ nodes: mermaidDivs })
        } catch (e) {
          console.warn('Mermaid rendering error:', e)
        }
      }
      
      // Setup tab switching
      const tabContainers = previewContent.value.querySelectorAll('.tabs-container')
      tabContainers.forEach(container => {
        const buttons = container.querySelectorAll('.tab-btn')
        const contents = container.querySelectorAll('.tab-content')
        
        buttons.forEach(btn => {
          btn.addEventListener('click', () => {
            const index = btn.dataset.tabIndex
            
            // Update button states
            buttons.forEach(b => b.classList.remove('active'))
            btn.classList.add('active')
            
            // Update content visibility
            contents.forEach(c => {
              c.classList.toggle('active', c.dataset.tabIndex === index)
            })
          })
        })
      })
      
      // Setup code copy buttons
      const copyButtons = previewContent.value.querySelectorAll('.code-copy-btn')
      copyButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.dataset.code
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
          
          const success = await copyToClipboard(code)
          if (success) {
            // Visual feedback
            const icon = btn.querySelector('i')
            icon.className = 'fa-solid fa-check'
            btn.classList.add('copied')
            setTimeout(() => {
              icon.className = 'fa-regular fa-copy'
              btn.classList.remove('copied')
            }, 2000)
          } else {
            console.error('Failed to copy')
          }
        })
      })
    }
  })
}

// Resize functions
const startResize = (e) => {
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

const handleResize = (e) => {
  if (!isResizing.value || !contentArea.value) return
  const rect = contentArea.value.getBoundingClientRect()
  const newWidth = ((e.clientX - rect.left) / rect.width) * 100
  editorWidth.value = Math.max(20, Math.min(80, newWidth))
}

const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

// Scroll to top/bottom
// Flag to prevent sync conflict during programmatic scroll
const isProgrammaticScrolling = ref(false)

const scrollToTop = () => {
  isProgrammaticScrolling.value = true
  
  if (previewContainer.value) {
    previewContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
  }
  if (editorView.value && editorView.value.scrollDOM) {
    editorView.value.scrollDOM.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  // Reset flag after scroll animation completes
  setTimeout(() => {
    isProgrammaticScrolling.value = false
  }, 1000)
}

const scrollToBottom = () => {
  isProgrammaticScrolling.value = true
  
  if (previewContainer.value) {
    previewContainer.value.scrollTo({ top: previewContainer.value.scrollHeight, behavior: 'smooth' })
  }
  if (editorView.value && editorView.value.scrollDOM) {
    editorView.value.scrollDOM.scrollTo({ top: editorView.value.scrollDOM.scrollHeight, behavior: 'smooth' })
  }
  
  // Reset flag after scroll animation completes
  setTimeout(() => {
    isProgrammaticScrolling.value = false
  }, 1000)
}

// Scroll to TOC item
const scrollToHeading = (id) => {
  const el = document.getElementById(id)
  if (el) {
    // Set flag to prevent scroll sync from interfering with smooth scroll
    isProgrammaticScrolling.value = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    
    // After scroll animation completes, sync editor position
    setTimeout(() => {
      // Sync editor to match preview scroll position
      if (mode.value === 'both' && previewContainer.value && editorView.value?.scrollDOM) {
        const preview = previewContainer.value
        const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)
        const scroller = editorView.value.scrollDOM
        scroller.scrollTo({
          top: percentage * (scroller.scrollHeight - scroller.clientHeight),
          behavior: 'smooth'
        })
      }
      // Reset programmatic scrolling flag after editor also finishes scrolling
      setTimeout(() => {
        isProgrammaticScrolling.value = false
      }, 500)
    }, 600)
  }
}

// Image Lightbox Logic
const lightboxImage = ref(null)

const handlePreviewClick = (event) => {
  const target = event.target
  
  // Handle task list checkbox click
  if (target.classList.contains('task-list-item-checkbox')) {
    // Prevent default checkbox toggle to avoid flicker
    event.preventDefault()
    
    if (!canEdit.value || !editorView.value) return
    
    // Find index of clicked checkbox
    const checkboxes = previewContent.value.querySelectorAll('.task-list-item-checkbox')
    let checkboxIndex = -1
    for (let i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i] === target) {
        checkboxIndex = i
        break
      }
    }
    if (checkboxIndex === -1) return
    
    // Find task list items in source by scanning for [ ] or [x] patterns
    const lines = content.value.split('\n')
    let taskCount = 0
    
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
      const line = lines[lineNo]
      // Match task list pattern: starts with list marker followed by [ ] or [x]
      const match = line.match(/^(\s*[-*+]|\s*\d+\.)\s+\[([ xX])\]/)
      if (match) {
        if (taskCount === checkboxIndex) {
          // Found the line! Toggle the checkbox
          const doc = editorView.value.state.doc
          const cmLine = doc.line(lineNo + 1) // CodeMirror lines are 1-indexed
          const lineContent = cmLine.text
          
          // Toggle checkbox in line content
          const newLineContent = lineContent.replace(/\[([ xX])\]/, (m, p1) => {
            return p1 === ' ' ? '[x]' : '[ ]'
          })
          
          if (newLineContent !== lineContent) {
            editorView.value.dispatch({
              changes: {
                from: cmLine.from,
                to: cmLine.to,
                insert: newLineContent
              }
            })
          }
          return
        }
        taskCount++
      }
    }
    return
  }
  
  // Handle image clicks
  if (target.tagName === 'IMG' && !target.closest('.mermaid')) {
    lightboxImage.value = target.src
  }
}

const closeLightbox = () => {
    lightboxImage.value = null
}

// Image Upload Helper
const uploadAndInsertImage = async (file, view, eventType = 'paste', coords = null) => {
  try {
    const res = await api.uploadImage(file)
    const markdown = eventType === 'drop' ? `![${file.name}](${res.url})` : `![image](${res.url})`
    
    let insertPos
    if (eventType === 'drop' && coords) {
      const pos = view.posAtCoords(coords)
      insertPos = pos ? pos : view.state.selection.main.from
    } else {
      insertPos = view.state.selection.main.from
    }

    const transaction = view.state.update({
      changes: { from: insertPos, insert: markdown + (eventType === 'drop' ? '\n' : '') }
    })
    view.dispatch(transaction)
  } catch (error) {
    console.error('Image upload failed:', error)
    if (window.showAlert) {
      window.showAlert('圖片上傳失敗：' + error.message, 'error')
    } else {
      alert('圖片上傳失敗：' + error.message)
    }
  }
}

// Paste Handling
const handlePaste = (event, view) => {
  const items = event.clipboardData?.items
  if (!items) return false

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const file = item.getAsFile()
      if (file) {
        uploadAndInsertImage(file, view, 'paste')
      }
      return true
    }
  }
  return false
}

const handleDrop = (event, view) => {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return false

  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) return false

  event.preventDefault()
  
  for (const file of imageFiles) {
    uploadAndInsertImage(file, view, 'drop', { x: event.clientX, y: event.clientY })
  }
  return true
}

// Sync Scroll
const syncScrollFromEditor = (target) => {
  if (!previewContainer.value || mode.value !== 'both' || isProgrammaticScrolling.value) return
  const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight)
  const preview = previewContainer.value
  preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight)
}

const syncScrollFromPreview = (e) => {
  const preview = e.target
  
  // Handle TOC active state at top
  if (preview.scrollTop < 30 && toc.value.length > 0) {
    activeHeadingId.value = toc.value[0].id
  }

  if (!editorView.value || isSyncingRight.value || mode.value !== 'both' || isProgrammaticScrolling.value) return
  isSyncingLeft.value = true
  const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)
  const scroller = editorView.value.scrollDOM
  if (scroller) {
    scroller.scrollTop = percentage * (scroller.scrollHeight - scroller.clientHeight)
  }
  isSyncingLeft.value = false
}

// --- Markdown Toolbar Functions ---
// Undo/Redo functions
const performUndo = () => {
  if (!editorView.value) return
  undo(editorView.value)
  editorView.value.focus()
}

const performRedo = () => {
  if (!editorView.value) return
  redo(editorView.value)
  editorView.value.focus()
}

// Helper: Toggle wrap around selection
const toggleWrap = (prefix, suffix = prefix) => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from, to } = state.selection.main
  const text = state.sliceDoc(from, to)

  if (text.startsWith(prefix) && text.endsWith(suffix)) {
    // Remove wrap
    view.dispatch({
      changes: {
        from: from,
        to: to,
        insert: text.slice(prefix.length, -suffix.length)
      },
      selection: { anchor: from, head: to - prefix.length - suffix.length }
    })
  } else {
    // Add wrap
    view.dispatch({
      changes: {
        from: from,
        to: to,
        insert: prefix + text + suffix
      },
      selection: { anchor: from + prefix.length, head: to + prefix.length }
    })
  }
  view.focus()
}

// Helper: Toggle line prefix
const toggleLinePrefix = (prefix) => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  
  if (line.text.startsWith(prefix)) {
    // Remove prefix
    view.dispatch({
      changes: {
        from: line.from,
        to: line.from + prefix.length,
        insert: ''
      }
    })
  } else {
    // Add prefix
    view.dispatch({
      changes: {
        from: line.from,
        to: line.from,
        insert: prefix
      }
    })
  }
  view.focus()
}

const toggleBold = () => toggleWrap('**')
const toggleItalic = () => toggleWrap('*')
const toggleStrikethrough = () => toggleWrap('~~')
const toggleUnderline = () => toggleWrap('++')
const toggleSuperscript = () => toggleWrap('^')
const toggleSubscript = () => toggleWrap('~')


// Toggle task list item (- [ ])
const toggleTaskList = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  
  // Check if line already has task list pattern
  const taskMatch = line.text.match(/^(\s*)(- \[[x ]\] )/i)
  if (taskMatch) {
    // Remove task list prefix
    view.dispatch({
      changes: {
        from: line.from + taskMatch[1].length,
        to: line.from + taskMatch[0].length,
        insert: ''
      }
    })
  } else {
    // Check if it's a regular list item
    const listMatch = line.text.match(/^(\s*)(- )/)
    if (listMatch) {
      // Convert to task list
      view.dispatch({
        changes: {
          from: line.from + listMatch[1].length,
          to: line.from + listMatch[0].length,
          insert: '- [ ] '
        }
      })
    } else {
      // Add task list at beginning
      view.dispatch({
        changes: {
          from: line.from,
          to: line.from,
          insert: '- [ ] '
        }
      })
    }
  }
  view.focus()
}

const cycleHeading = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  
  const match = line.text.match(/^(#{1,6})\s/)
  let changes
  
  if (!match) {
    // No heading -> H1
    changes = { from: line.from, to: line.from, insert: '# ' }
  } else if (match[1].length < 6) {
    // Increment level
    changes = { from: line.from, to: line.from, insert: '#' }
  } else {
    // H6 -> remove
    changes = { from: line.from, to: line.from + 7, insert: '' }
  }
  
  view.dispatch({ changes })
  view.focus()
}

const toggleBlockquote = () => toggleLinePrefix('> ')
const toggleUnorderedList = () => toggleLinePrefix('- ')

const toggleOrderedList = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  
  const match = line.text.match(/^\d+\.\s/)
  if (match) {
    view.dispatch({ changes: { from: line.from, to: line.from + match[0].length, insert: '' } })
  } else {
    view.dispatch({ changes: { from: line.from, to: line.from, insert: '1. ' } })
  }
  view.focus()
}

const insertCodeBlock = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from } = state.selection.main
  const insert = '\n```\n\n```\n'
  view.dispatch({
    changes: { from: from, insert: insert },
    selection: { anchor: from + 5 }
  })
  view.focus()
}

const insertTable = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { from } = view.state.selection.main
  const insert = '\n| 標題 1 | 標題 2 | 標題 3 |\n| --- | --- | --- |\n| 內容 | 內容 | 內容 |\n'
  view.dispatch({
    changes: { from: from, insert: insert },
    selection: { anchor: from + 14 }
  })
  view.focus()
}

const toggleLink = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from, to } = state.selection.main
  const text = state.sliceDoc(from, to)
  const linkMatch = text.match(/^\[(.+)\]\((.+)\)$/)
  
  if (linkMatch) {
    view.dispatch({
      changes: { from: from, to: to, insert: linkMatch[1] }
    })
  } else if (text) {
    view.dispatch({
      changes: { from: from, to: to, insert: '[' + text + '](url)' },
      selection: { anchor: to + 3, head: to + 6 } // Select 'url'
    })
  } else {
    view.dispatch({
      changes: { from: from, insert: '[Link](url)' },
      selection: { anchor: from + 1, head: from + 5 } // Select 'Link'
    })
  }
  view.focus()
}

const toggleImage = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from, to } = state.selection.main
  const text = state.sliceDoc(from, to)
  const imgMatch = text.match(/^!\[(.+)\]\((.+)\)$/)
  
  if (imgMatch) {
     view.dispatch({
      changes: { from: from, to: to, insert: imgMatch[1] }
    })
  } else if (text) {
    view.dispatch({
      changes: { from: from, to: to, insert: '![' + text + '](imageUrl)' },
      selection: { anchor: to + 4, head: to + 12 } 
    })
  } else {
    view.dispatch({
      changes: { from: from, insert: '![Desc](imageUrl)' },
       selection: { anchor: from + 2, head: from + 6 }
    })
  }
  view.focus()
}

const toggleHorizontalRule = () => {
  if (!editorView.value) return
  const view = editorView.value
  const { state } = view
  const { from } = state.selection.main
  const line = state.doc.lineAt(from)
  
  if (line.text.trim() === '---') {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' }
    })
  } else {
    view.dispatch({ changes: { from: line.to, insert: '\n---\n' } })
  }
  view.focus()
}

// Relative time for last edited
const relativeLastEditedTime = computed(() => {
  if (!lastContentEditedAt.value) return null
  return dayjs(lastContentEditedAt.value).fromNow()
})

// Formatted created date (2025年01月02日)
const formattedCreatedDate = computed(() => {
  if (!noteCreatedAt.value) return null
  return dayjs(noteCreatedAt.value).format('YYYY年MM月DD日')
})

// Detailed time for tooltip (2025年01月02日 08:36)
const detailedCreatedTime = computed(() => {
  if (!noteCreatedAt.value) return null
  return dayjs(noteCreatedAt.value).format('YYYY年MM月DD日 HH:mm')
})

const detailedEditedTime = computed(() => {
  if (!lastContentEditedAt.value) return null
  return dayjs(lastContentEditedAt.value).format('YYYY年MM月DD日 HH:mm')
})

// Check if the note has been edited (different from created)
const isEdited = computed(() => {
  if (!noteCreatedAt.value || !lastContentEditedAt.value) return false
  // Consider edited if difference > 1 minute
  return Math.abs(dayjs(lastContentEditedAt.value).diff(dayjs(noteCreatedAt.value), 'minute')) > 1
})

// Extract title from first H1 heading
const extractTitle = (text) => {
  const match = text.match(/^#\s+(.+)$/m)
  return match ? match[1] : 'Untitled'
}

// Debounced save
let saveTimeout = null
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveNote, 500)
}

// Save note
// Save note
const saveNote = async (manual = false) => {
  if (!note.value || !canEdit.value) return
  
  // Clean auto-save: skip if no changes and not a manual save
  if (!manual && !hasUnsavedChanges.value) return

  saving.value = true
  try {
    const newTitle = extractTitle(content.value)
    await api.updateNote(note.value.id, { content: content.value, title: newTitle })
    lastSaved.value = new Date()
    hasUnsavedChanges.value = false
  } catch (e) {
    console.error('Failed to save note:', e)
  } finally {
    saving.value = false
  }
}

// Force save before leaving (clear debounce and save immediately)
const forceSave = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  if (content.value && canEdit.value && note.value) {
    await saveNote()
  }
}

// Handle beforeunload event (browser close/refresh)
const handleBeforeUnload = (e) => {
  if (canEdit.value && note.value) {
    // Trigger synchronous save attempt
    forceSave()
  }
}

// Global save handler
const handleGlobalSave = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveNote(true)
  }
}

// Set mode
const setMode = (m) => {
  mode.value = m
}


// Update highlight.js style
const updateHighlightStyle = (t) => {
  let styleEl = document.getElementById('hljs-theme-style')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'hljs-theme-style'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = t === 'dark' ? hljsGithubDark : hljsGithubLight
}

// Set theme
const setTheme = (t) => {
  theme.value = t
  localStorage.setItem('NoteHubMD-theme', t)
  if (t === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  updateHighlightStyle(t)
}

// Set view mode
const setGlobalViewMode = (m) => {
  globalViewMode.value = m
  localStorage.setItem('NoteHubMD-viewMode', m)
}

// Logout
const logout = async () => {
  await api.logout()
  window.location.href = '/login'
}

// Create note
const createNewNote = async () => {
  try {
    const newNote = await api.createNote()
    window.location.href = '/n/' + newNote.id
  } catch (e) {
    showAlert?.('建立筆記失敗', 'error')
  }
}

const createWhiteboard = async () => {
  try {
    const newNote = await api.createWhiteboard()
    window.location.href = '/n/' + newNote.id
  } catch (e) {
    showAlert?.('建立白板失敗', 'error')
  }
}

const createFlowchart = async () => {
  try {
    const newNote = await api.createFlowchart()
    window.location.href = '/n/' + newNote.id
  } catch (e) {
    showAlert?.('建立流程圖失敗', 'error')
  }
}




// Create book
const handleCreateBook = async (data) => {
  try {
    const newBook = await api.createBook(data)
    showCreateBookModal.value = false
    router.push('/b/' + newBook.id)
  } catch (e) {
    showAlert?.('建立書本失敗', 'error')
  }
}

/* [DISABLED] 釘選功能暫時停用
// Unpin
const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id))
  } catch (e) {
    showAlert?.('取消釘選失敗', 'error')
  }
}
*/

// Share note
const shareNote = () => {
  noteInfoModalTab.value = 'share'
  showNoteInfoModal.value = true
}

// Toggle online users popup
const toggleOnlineUsersPopup = () => {
  showOnlineUsersPopup.value = !showOnlineUsersPopup.value
}

// Scroll to a user's cursor position
const scrollToUserCursor = (username) => {
  if (!yjsInstance.value || !editorView.value) return
  
  // Find the cursor for this user
  const cursors = yjsInstance.value.remoteCursors.value
  let targetCursor = null
  
  for (const [clientId, cursor] of cursors) {
    if (cursor.username === username) {
      targetCursor = cursor
      break
    }
  }
  
  if (targetCursor && targetCursor.index !== undefined) {
    // Scroll to the cursor position in CodeMirror
    const pos = targetCursor.index
    
    // Make sure position is valid
    if (pos >= 0 && pos <= editorView.value.state.doc.length) {
      // Set selection to the user's position and scroll into view
      editorView.value.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true
      })
      
      // Close the popup
      showOnlineUsersPopup.value = false
    }
  }
}

// Handle permission change
const handlePermissionChange = async (newPerm) => {
  try {
    await api.updateNote(note.value.id, { permission: newPerm })
    permission.value = newPerm
  } catch (e) {
    showAlert?.('更新權限失敗', 'error')
  }
}

// Auto save comments enabled
const autoSaveCommentsEnabled = async (enabled) => {
  try {
    await api.updateNote(note.value.id, { commentsEnabled: enabled })
    noteCommentsEnabled.value = enabled
  } catch (e) {
    showAlert?.('更新失敗', 'error')
  }
}

// Auto save isPublic
const autoSaveIsPublic = async (isPublic) => {
  try {
    await api.updateNote(note.value.id, { isPublic })
    note.value.isPublic = isPublic
  } catch (e) {
    showAlert?.('更新失敗', 'error')
  }
}

// Share handlers
const handleShareIdUpdate = (newShareId) => {
  if (note.value) {
    note.value.shareId = newShareId
  }
}

const handleShareAliasUpdate = (newAlias) => {
  if (note.value) {
    note.value.shareAlias = newAlias
  }
}

// Move note to book
const moveNoteToBook = async (bookId) => {
  try {
    await api.updateNote(note.value.id, { bookId: bookId || null })
    note.value.bookId = bookId || null
    book.value = bookId ? books.value.find(b => b.id === bookId) || null : null
    showAlert?.('筆記已移動', 'success')
  } catch (e) {
    showAlert?.('移動筆記失敗', 'error')
  }
}

// User permissions
const searchUsers = async () => {
  if (!userSearchQuery.value.trim()) {
    userSearchResults.value = []
    return
  }
  try {
    userSearchResults.value = await api.searchUsers(userSearchQuery.value)
  } catch (e) {
    userSearchResults.value = []
  }
}

const addUserPermission = async (user) => {
  try {
    await api.addNoteUserPermission(note.value.id, user.id, newUserPermission.value)
    userPermissions.value.push({ userId: user.id, user, permission: newUserPermission.value })
    userSearchQuery.value = ''
    userSearchResults.value = []
  } catch (e) {
    showAlert?.('新增權限失敗', 'error')
  }
}

const removeUserPermission = async (userId) => {
  try {
    await api.removeNoteUserPermission(note.value.id, userId)
    userPermissions.value = userPermissions.value.filter(p => p.userId !== userId)
  } catch (e) {
    showAlert?.('移除權限失敗', 'error')
  }
}

const updateUserPermissionLevel = async (perm, newLevel) => {
  try {
    await api.addNoteUserPermission(note.value.id, perm.userId, newLevel)
    const idx = userPermissions.value.findIndex(p => p.userId === perm.userId)
    if (idx !== -1) {
      userPermissions.value[idx].permission = newLevel
    }
  } catch (e) {
    showAlert?.('更新權限失敗', 'error')
  }
}

// Handle revision restore
const handleRevisionRestore = (restoredContent) => {
  content.value = restoredContent
  if (editorView.value) {
    const currentDoc = editorView.value.state.doc.toString()
    editorView.value.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: restoredContent }
    })
  }
  renderMarkdown()
  saveNote()
}

// Handle user profile update
const handleUserProfileUpdate = (data) => {
  if (currentUser.value) {
    currentUser.value.name = data.name
    currentUser.value.avatar = data.avatar
    currentUser.value.avatarOriginal = data.avatarOriginal
  }
}

// Export as Markdown
const exportAsMarkdown = () => {
  const filename = (note.value?.title || 'Untitled').replace(/[<>:"/\\|?*]/g, '_') + '.md'
  const blob = new Blob([content.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showExportModal.value = false
  showAlert?.('已匯出 Markdown 檔案', 'success')
}

// Export as PDF
const exportAsPDF = async () => {
  try {
    const html2pdf = (await import('html2pdf.js')).default
    const element = previewContent.value
    if (!element) {
      showAlert?.('無法取得預覽內容', 'error')
      return
    }
    
    const filename = (note.value?.title || 'Untitled').replace(/[<>:"/\\|?*]/g, '_') + '.pdf'
    
    const opt = {
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }
    
    showAlert?.('正在生成 PDF...', 'info')
    await html2pdf().set(opt).from(element).save()
    showExportModal.value = false
    showAlert?.('已匯出 PDF 檔案', 'success')
  } catch (e) {
    console.error('PDF export failed:', e)
    showAlert?.('PDF 匯出失敗', 'error')
  }
}

// Format date
const formatDate = (date) => dayjs(date).format('YYYY/MM/DD HH:mm')



const setupIntersectionObserver = () => {
  if (tocObserver) tocObserver.disconnect()
  
  if (!previewContainer.value) return

  tocObserver = new IntersectionObserver((entries) => {
    // Find all intersecting entries
    const visibleEntries = entries.filter(e => e.isIntersecting)
    if (visibleEntries.length > 0) {
      // Sort by DOM position (assuming entries order might not be guaranteed, though usually is)
      // Actually, we can just find which one corresponds to the earliest TOC item
      // For simplicity, let's just use the first intersecting one if multiple
      // But we need to check if we are overwriting an existing earlier one?
      // IntersectionObserver usually triggers for everything crossing the threshold.
      
      // Let's rely on the fact that we want the TOPMOST visible item.
      // We can map ids to indices.
      const firstVisible = visibleEntries.reduce((prev, curr) => {
        const prevIdx = toc.value.findIndex(t => t.id === prev.target.id)
        const currIdx = toc.value.findIndex(t => t.id === curr.target.id)
        return (prevIdx !== -1 && currIdx !== -1 && prevIdx < currIdx) ? prev : curr
      })
      
      activeHeadingId.value = firstVisible.target.id
    }
  }, {
    root: previewContainer.value,
    rootMargin: '0px 0px -120% 0px',
    threshold: 0
  })

  // Observe all headings
  const headings = previewContent.value.querySelectorAll('h1, h2, h3')
  headings.forEach(h => tocObserver.observe(h))
}

watch(showPreview, (val) => {
  if (val) {
    // Force re-render/scan when preview becomes visible
    nextTick(() => renderMarkdown())
  }
})

// Lifecycle
// Named handler for proper cleanup (prevent memory leak)
const handleDocumentClick = (e) => {
  
  // Close online users popup
  if (showOnlineUsersPopup.value) {
    const isOnlineUsersBtn = e.target.closest('[data-online-users-btn]')
    const isOnlineUsersPopup = e.target.closest('[data-online-users-popup]')
    if (!isOnlineUsersBtn && !isOnlineUsersPopup) {
      showOnlineUsersPopup.value = false
    }
  }
}

onMounted(() => {
  // Global Ctrl+S handler
  window.addEventListener('keydown', handleGlobalSave)
  // Close menu/popups on click outside
  document.addEventListener('click', handleDocumentClick)
  // Save on browser close/refresh
  window.addEventListener('beforeunload', handleBeforeUnload)
  // Cross-tab sync for AI button visibility
  window.addEventListener('storage', handleStorageChange)

  updateHighlightStyle(theme.value)
  loadNote()
})

onUnmounted(() => {
  // Save any pending changes before leaving
  forceSave()
  
  window.removeEventListener('keydown', handleGlobalSave)
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('storage', handleStorageChange)
  if (saveTimeout) clearTimeout(saveTimeout)
  if (renderTimeout) clearTimeout(renderTimeout)
  if (tocObserver) tocObserver.disconnect()
  if (editorView.value) {
    editorView.value.destroy()
    editorView.value = null
  }
  if (note.value) {
    leaveNote(note.value.id)
    offNoteUpdated()
    offUsersInNote()
    offPermissionChanged()
  }
  
  // Cleanup Yjs Awareness
  if (yjsInstance.value) {
    yjsInstance.value.destroy()
    yjsInstance.value = null
  }
})

// Watch route
watch(() => route.params.id, async (newId, oldId) => {
  if (oldId) {
    // Save pending changes before switching notes
    await forceSave()
    leaveNote(oldId)
    offNoteUpdated()
    offUsersInNote()
    offPermissionChanged()
    
    // Cleanup Yjs Awareness before switching
    if (yjsInstance.value) {
      yjsInstance.value.destroy()
      yjsInstance.value = null
    }
  }
  if (editorView.value) {
    editorView.value.destroy()
    editorView.value = null
  }
  loadNote()
})
</script>

<template>
  <div class="flex h-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text">
    <!-- Collapsed Sidebar Strip -->
    <div @click="showSidebar = true" 
         class="w-12 bg-gray-200 dark:bg-gray-900 dark:text-white flex flex-col items-center py-3 border-r border-gray-300 dark:border-gray-800 shrink-0 z-30 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
         title="展開選單">
      <a href="/" @click.stop class="flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-800 transition">
        <img src="@/assets/images/logo.png" alt="NoteHubMD" class="w-8 h-8">
      </a>
      <div class="flex-1"></div>
      <div class="w-8 h-8 rounded-full flex items-center justify-center text-white overflow-hidden"
           :class="currentUser ? 'bg-blue-600' : 'bg-gray-500'">
        <img v-if="currentUser?.avatar" :src="currentUser.avatar" class="w-full h-full object-cover" alt="Avatar">
        <span v-else>{{ currentUser?.username?.charAt(0).toUpperCase() || '?' }}</span>
      </div>
    </div>

    <!-- Expanded Sidebar -->
    <Transition name="note-sidebar-slide">
      <div v-if="showSidebar" class="fixed inset-0 z-40" @click="showSidebar = false">
        <div class="absolute inset-0 bg-black/60"></div>
        <div class="absolute top-0 h-full" @click.stop>
          <SidebarNav 
            :user="currentUser"
            :books="filteredSidebarBooks"
            :pinned-items="pinnedItems"
            :show-pinned="true"
            :show-more-books="false"
            :current-route="currentRoute"
            :global-view-mode="globalViewMode"
            :app-version="appVersion"
            @view-mode-change="setGlobalViewMode"
            @create-note="createNewNote"
            @create-whiteboard="createWhiteboard"
            @create-drawio="createFlowchart"
            @create-book="showCreateBookModal = true"
            @open-profile="settingsInitialTab = 'profile'; showSettingsModal = true"
            @open-settings="settingsInitialTab = 'appearance'; showSettingsModal = true"
          />
        </div>
      </div>
    </Transition>
    
    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Loading -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
      </div>

      <!-- Note Content -->
      <template v-else-if="note">
        <!-- Header -->
        <div class="bg-gray-200 dark:bg-gray-900 dark:text-white px-3 py-2 flex items-center shadow-md z-30 shrink-0 relative">
          <div class="flex-1 flex items-center space-x-2">
            <template v-if="book">
              <div class="relative group">
                <a :href="'/b/' + book.id" class="hover:text-blue-400 transition">
                  <i class="fa-solid fa-book mr-1"></i>{{ book.title }}
                </a>
                <!-- Book Notes Tooltip -->
                <div v-if="book.Notes && book.Notes.length > 0" class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
                  <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700" style="min-width: 280px; max-width: 400px;">
                    <!-- Arrow -->
                    <div class="absolute top-0 left-4 w-4 h-4 bg-gray-200 dark:bg-gray-800 border-t border-l border-gray-300 dark:border-gray-700 transform rotate-45"></div>
                    <div class="relative z-10 p-3">
                      <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                        <i class="fa-solid fa-list mr-2"></i>
                        書本筆記 ({{ book.Notes.length }})
                      </div>
                      <ul class="space-y-1 max-h-64 overflow-y-auto">
                        <li v-for="bookNote in book.Notes" :key="bookNote.id">
                          <a 
                            :href="'/n/' + bookNote.id"
                            class="flex items-center text-sm py-1.5 px-2 rounded transition"
                            :class="bookNote.id === note.id ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-400 hover:text-black dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'">
                            <i :class="[bookNote.noteType === 'excalidraw' ? 'fas fa-chalkboard' : 'fas fa-note-sticky', 'mr-2 text-xs', bookNote.id === note.id ? 'text-white' : (bookNote.noteType === 'excalidraw' ? 'text-purple-500' : 'text-blue-500')]"></i>
                            <span class="truncate" :title="bookNote.title || 'Untitled'">{{ bookNote.title || 'Untitled' }}</span>
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <span class="text-gray-600">/</span>
            </template>
            <span class="text-md bg-gray-300 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-xs">
              <i class="fa-solid fa-note-sticky text-blue-500 mr-1"></i>{{ note.title || 'Untitled' }}
            </span>
            <span v-if="saving" class="text-xs text-gray-400 ml-2">儲存中...</span>
            <span v-else class="text-xs text-gray-500 ml-2">{{ getRelativeTime(lastSaved) }} 已儲存</span>
          </div>
          
          <!-- Mode Toggle -->
          <div class="flex bg-gray-300 dark:bg-gray-800 rounded-lg p-0.5 space-x-0.5">
            <button @click="setMode('edit')" class="w-7 h-7 flex items-center justify-center rounded transition text-sm cursor-pointer" 
                    :class="mode === 'edit' ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-400 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'" title="Edit">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button @click="setMode('both')" class="w-7 h-7 flex items-center justify-center rounded transition text-sm cursor-pointer" 
                    :class="mode === 'both' ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-400 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'" title="Both">
              <i class="fa-solid fa-columns"></i>
            </button>
            <button @click="setMode('view')" class="w-7 h-7 flex items-center justify-center rounded transition text-sm cursor-pointer" 
                    :class="mode === 'view' ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-400 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'" title="View">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          
          <!-- Right Actions -->
          <div class="flex-1 flex justify-end items-center space-x-2">
            <!-- Theme Toggle -->
            <button @click="toggleTheme" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer min-h-[28px]"
                    :title="theme === 'dark' ? '切換為淺色模式' : '切換為深色模式'">
              <i :class="theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'" class="text-xs"></i>
            </button>

            <!-- Online Users -->
            <div class="relative">
              <button @click="toggleOnlineUsersPopup" 
                      data-online-users-btn
                      class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
                <i class="fa-solid fa-users text-xs"></i>
                <span class="font-medium">{{ onlineUsers.length }}</span>
              </button>
              <div v-if="showOnlineUsersPopup" 
                   data-online-users-popup
                   class="absolute right-0 top-full mt-2 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700 z-[60]">
                <div class="p-3">
                  <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
                    <i class="fa-solid fa-users mr-1"></i> 在線用戶 ({{ onlineUsers.length }})
                  </div>
                  <ul class="space-y-1 max-h-48 overflow-y-auto">
                    <li v-for="(user, index) in onlineUsers" :key="index" 
                        class="flex items-center text-sm text-gray-800 dark:text-gray-200 py-1 px-2 rounded cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 transition"
                        @click="scrollToUserCursor(user.username)"
                        title="點擊跳往此用戶位置">
                      <span class="w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-medium text-white shrink-0"
                            :class="user.username && user.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                        {{ user.username?.charAt(0).toUpperCase() || '?' }}
                      </span>
                      <span class="truncate flex-1">{{ user.name || user.username || 'Guest' }} <span class="text-gray-500">@{{ user.username || 'Guest' }}</span></span>
                      <i class="fa-solid fa-location-arrow text-xs text-gray-400 ml-1"></i>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            
            <!-- Permission -->
            <button v-if="isOwner" @click="noteInfoModalTab = 'permission'; showNoteInfoModal = true;" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
              <i class="fa-solid fa-lock text-xs"></i>
              <span>{{ permissionOptions.find(o => o.value === permission)?.label || permission }}</span>
            </button>
            
            <!-- Note Info -->
            <button v-if="canEdit || isOwner" @click="noteInfoModalTab = 'info'; showNoteInfoModal = true; showNoteMenu = false;" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
              <i class="fa-solid fa-cog text-xs mr-1"></i>
              <span>筆記設定</span>
            </button>
            
            <!-- Note Menu Dropdown -->
            <div class="relative">
              <button @click="showNoteMenu = !showNoteMenu" 
                      class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
                <i class="fa-solid fa-ellipsis-v text-xs"></i>
                <span>更多</span>
              </button>
              
              <div v-if="showNoteMenu" 
                   class="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[60]"
                   @click.stop>
                <button v-if="canEdit || isOwner" @click="showRevisionsModal = true; showNoteMenu = false;"
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer">
                  <i class="fa-solid fa-history w-5 mr-2"></i>版本紀錄
                </button>
                <button v-if="canEdit" @click="noteInfoModalTab = 'data'; showNoteInfoModal = true; showNoteMenu = false;"
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg flex items-center cursor-pointer">
                  <i class="fa-solid fa-file-export w-5 mr-2"></i>匯出筆記
                </button>
                <a :href="'/s/' + (note.shareAlias || note.shareId || note.id) + '?view=slide'" 
                   target="_blank"
                   @click="showNoteMenu = false"
                   class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer">
                  <i class="fa-solid fa-display w-5 mr-2"></i>簡報模式
                </a>
                <!-- AI Assistant (shown when floating button is hidden) -->
                <button v-if="aiEnabled && hideAiFloatingButton" 
                        @click="showAiChatFromMenu = true; showNoteMenu = false;"
                        class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer">
                  <i class="fa-solid fa-robot w-5 mr-2"></i>AI 助理
                </button>
                <div class="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                <a href="/s/sys-markdown" target="_blank" @click="showNoteMenu = false"
                   class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg flex items-center">
                  <i class="fa-brands fa-markdown w-5 mr-2"></i>語法教學
                </a>
              </div>
              
              <!-- Click outside to close -->
              <div v-if="showNoteMenu" class="fixed inset-0 z-[55]" @click="showNoteMenu = false"></div>
            </div>
            
            <!-- Share -->
            <button v-if="canEdit || isOwner" @click="shareNote" 
                    class="flex items-center space-x-1 bg-transparent hover:bg-green-600 dark:bg-gray-800 border border-green-600 px-3 py-1 rounded text-sm text-green-600 dark:text-green-500 hover:text-white transition cursor-pointer">
              <i class="fa-solid fa-share-alt text-xs"></i>
              <span>分享</span>
            </button>
          </div>
        </div>
        
        <!-- Content Area -->
        <div ref="contentArea" class="flex-1 flex overflow-hidden relative z-0">
          <!-- Editor -->
          <div v-show="showEditor" class="h-full flex flex-col" 
               :class="showPreview ? 'border-r border-gray-300 dark:border-gray-700' : ''"
               :style="showPreview ? { width: editorWidth + '%' } : { width: '100%' }">
            
            <!-- Markdown Toolbar -->
            <div class="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-1 py-1 flex items-center gap-1 shrink-0 z-20 overflow-x-auto custom-scrollbar">
                <button @click="performUndo" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="上一步 (Ctrl+Z)">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button @click="performRedo" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="下一步 (Ctrl+Y)">
                    <i class="fa-solid fa-rotate-right"></i>
                </button>
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5"></div>
                <button @click="toggleBold" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Bold">
                    <i class="fa-solid fa-bold"></i>
                </button>
                <button @click="toggleItalic" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Italic">
                    <i class="fa-solid fa-italic"></i>
                </button>
                <button @click="toggleStrikethrough" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Strikethrough">
                    <i class="fa-solid fa-strikethrough"></i>
                </button>
                <button @click="toggleUnderline" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Underline">
                    <i class="fa-solid fa-underline"></i>
                </button>
                <button @click="toggleSuperscript" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Superscript">
                    <i class="fa-solid fa-superscript"></i>
                </button>
                <button @click="toggleSubscript" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Subscript">
                    <i class="fa-solid fa-subscript"></i>
                </button>
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5"></div>
                <button @click="cycleHeading" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Heading">
                    <i class="fa-solid fa-heading"></i>
                </button>
                <button @click="toggleBlockquote" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Blockquote">
                    <i class="fa-solid fa-quote-left"></i>
                </button>
                <button @click="toggleUnorderedList" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Unordered List">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
                <button @click="toggleOrderedList" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Ordered List">
                    <i class="fa-solid fa-list-ol"></i>
                </button>
                <button @click="toggleTaskList" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="勾選清單">
                    <i class="fa-regular fa-square-check"></i>
                </button>
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5"></div>
                <button @click="insertCodeBlock" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Code Block">
                    <i class="fa-solid fa-code"></i>
                </button>
                <button @click="insertTable" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Table">
                    <i class="fa-solid fa-table"></i>
                </button>
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5"></div>
                <button @click="toggleLink" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Link">
                    <i class="fa-solid fa-link"></i>
                </button>
                <button @click="toggleImage" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Image">
                    <i class="fa-solid fa-image"></i>
                </button>
                <button @click="toggleHorizontalRule" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Horizontal Rule">
                    <i class="fa-solid fa-minus"></i>
                </button>
            </div>

            <div ref="editorContainer" class="flex-1 overflow-hidden relative editor-container"></div>
            <!-- Editor Footer -->
            <div class="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-1 flex justify-between items-center text-xs z-10 shrink-0">
              <div class="flex items-center space-x-3 text-gray-500 dark:text-gray-400 px-2 min-w-0">
                <span class="whitespace-nowrap">字數: {{ charCount }}</span>
                <span class="whitespace-nowrap">行數: {{ lineCount }}</span>
                <span v-if="selectedChars > 0 || selectedLines > 0">|</span>
                <span v-if="selectedLines > 0" class="whitespace-nowrap">已選擇 {{ selectedLines }} 行</span>
                <span v-if="selectedChars > 0" class="whitespace-nowrap">已選擇 {{ selectedChars }} 個字</span>
              </div>
              <select v-model="selectedEditorTheme" class="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer mr-2">
                <option v-for="t in editorThemeList" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
          </div>
          
          <!-- Resizable Divider (only in Both mode) -->
          <div v-if="showEditor && showPreview" 
               class="w-0.5 bg-gray-300 hover:bg-blue-400 dark:bg-gray-700 dark:hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-10"
               @mousedown="startResize"
               title="拖曳調整寬度"></div>
          
          <!-- Preview with TOC -->
          <div v-show="showPreview" class="h-full flex min-w-0 flex-1 relative">
            <!-- Preview Content -->
            <div class="h-full flex flex-col flex-1 overflow-auto bg-white dark:bg-dark-bg" ref="previewContainer" @scroll="syncScrollFromPreview" @click="handlePreviewClick">
              <!-- Preview Info Bar -->
              <div class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 text-xs text-gray-500 dark:text-gray-400 shrink-0 sticky top-0 z-20"
                   :class="{'flex justify-center': !showEditor}">
                <div :class="{'w-full px-8': !showEditor, 'px-4': showEditor}" :style="!showEditor ? 'max-width: 800px' : ''">
                  <div class="flex items-center flex-wrap gap-y-1">
                    <!-- Author with Tooltip -->
                    <template v-if="noteOwner">
                      <div class="relative group inline-flex items-center">
                        <!-- <span class="w-5 h-5 rounded-full flex items-center justify-center font-medium text-white shrink-0 overflow-hidden cursor-help mr-1"
                              style="font-size: 10px;"
                              :class="noteOwner.username && noteOwner.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                          <img v-if="noteOwner.avatar" :src="noteOwner.avatar" class="w-full h-full object-cover" alt="">
                          <template v-else>{{ noteOwner.username?.charAt(0).toUpperCase() || '?' }}</template>
                        </span> -->
                        <span class="cursor-help hover:text-gray-700 dark:hover:text-gray-300">{{ noteOwner.name || noteOwner.username || '?' }}</span>
                        <!-- Owner Tooltip -->
                        <div class="absolute top-full left-0 mt-2 hidden group-hover:block z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600" style="min-width: 200px;">
                          <div class="absolute -top-2 left-2 w-4 h-4 bg-white dark:bg-gray-800 border-t border-l border-gray-200 dark:border-gray-600 transform rotate-45"></div>
                          <div class="flex items-center relative z-10">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center mr-3 overflow-hidden shrink-0 border-2 border-gray-100 dark:border-gray-600"
                                 :class="noteOwner.username && noteOwner.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                              <img v-if="noteOwner.avatar" :src="noteOwner.avatar" class="w-full h-full object-cover">
                              <span v-else class="text-xl text-white font-bold">{{ noteOwner.username?.charAt(0).toUpperCase() || '?' }}</span>
                            </div>
                            <div>
                              <div class="font-bold text-gray-900 dark:text-white text-base">{{ noteOwner.name || noteOwner.username || 'Guest' }}</div>
                              <div class="text-xs text-gray-500 dark:text-gray-400">@{{ noteOwner.username || 'guest' }}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                    <!-- Creation Date with Tooltip -->
                    <template v-if="formattedCreatedDate">
                      <span class="ms-2 me-1">創建於</span>
                      <span class="cursor-help" 
                            :title="detailedCreatedTime">
                        {{ formattedCreatedDate }}
                      </span>
                    </template>
                    
                    <!-- Last Editor -->
                    <template v-if="lastEditor">
                      <span class="mx-2 text-gray-400">|</span>
                      <div class="relative group inline-flex items-center">
                        <!-- <span class="w-5 h-5 rounded-full flex items-center justify-center font-medium text-white shrink-0 overflow-hidden cursor-help mr-1"
                              style="font-size: 10px;"
                              :class="lastEditor.username && lastEditor.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                          <img v-if="lastEditor.avatar" :src="lastEditor.avatar" class="w-full h-full object-cover" alt="">
                          <template v-else>{{ lastEditor.username?.charAt(0).toUpperCase() || '訪' }}</template>
                        </span> -->
                        <span class="cursor-help hover:text-gray-700 dark:hover:text-gray-300">{{ lastEditor.name || lastEditor.username || '訪客' }}</span>
                        <!-- Editor Tooltip -->
                        <div class="absolute top-full left-0 mt-2 hidden group-hover:block z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600" style="min-width: 200px;">
                          <div class="absolute -top-2 left-2 w-4 h-4 bg-white dark:bg-gray-800 border-t border-l border-gray-200 dark:border-gray-600 transform rotate-45"></div>
                          <div class="flex items-center relative z-10">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center mr-3 overflow-hidden shrink-0 border-2 border-gray-100 dark:border-gray-600"
                                 :class="lastEditor.username && lastEditor.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                              <img v-if="lastEditor.avatar" :src="lastEditor.avatar" class="w-full h-full object-cover">
                              <span v-else class="text-xl text-white font-bold">{{ lastEditor.username?.charAt(0).toUpperCase() || '訪' }}</span>
                            </div>
                            <div>
                              <div class="font-bold text-gray-900 dark:text-white text-base">{{ lastEditor.name || lastEditor.username || '訪客' }}</div>
                              <div class="text-xs text-gray-500 dark:text-gray-400">@{{ lastEditor.username || 'guest' }}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <span class="ms-2 me-1">編輯於</span>
                      <span class="cursor-help" :title="detailedEditedTime">{{ relativeLastEditedTime }}</span>
                    </template>
                  </div>
                </div>
              </div>
              <!-- Preview Content -->
              <div class="markdown-body dark:text-gray-300"
                   :class="{'flex justify-center': !showEditor, 'has-toc': toc.length > 0 && mode === 'view' && !showEditor}"
                   :style="toc.length > 0 && mode === 'view' && !showEditor ? 'padding-right: 15rem' : ''">
                <div :class="{'w-full px-8 pb-2': !showEditor, 'px-8 pb-2': showEditor}" :style="!showEditor ? 'max-width: 800px' : ''" ref="previewContent"></div>
              </div>

              <!-- Note Reactions (emoji feedback) -->
              <div v-if="(mode === 'view' || mode === 'both') && note?.id && featureConfig.noteReactions" class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                   :class="{'flex justify-center': !showEditor}">
                <div :class="{'w-full': !showEditor}" :style="!showEditor ? 'max-width: 800px' : ''">
                  <NoteReactions 
                    :noteId="note.id"
                    :currentUser="currentUser"
                  />
                </div>
              </div>

              <!-- Comments Section (hidden when commentsDisabled or global feature disabled) -->
              <div v-if="(mode === 'view' || mode === 'both') && noteCommentsEnabled && featureConfig.comments" class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                   :class="{'flex justify-center': !showEditor}">
                <div :class="{'w-full px-8 py-6': !showEditor, 'px-8 py-6': showEditor}" :style="!showEditor ? 'max-width: 800px' : ''">
                  <CommentSection 
                    v-if="note?.id"
                    :noteId="note.id"
                    :currentUser="currentUser"
                    :isOwner="isOwner"
                  />
                </div>
              </div>

              <!-- TOC Sidebar (only in view mode) - positioned relative to content -->
              <div v-if="toc.length > 0 && mode === 'view' && !showEditor" 
                  class="fixed w-56 overflow-y-auto p-3 hidden lg:block note-toc"
                  style="right: 2rem; top: 8rem; max-height: calc(100vh - 12rem);">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                    <i class="fa-solid fa-list mr-2"></i>目錄
                  </h3>
                  <div class="flex items-center space-x-1">
                    <button @click="scrollToTop" class="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="回到頂部">
                      <i class="fa-solid fa-arrow-up"></i>
                    </button>
                    <button @click="scrollToBottom" class="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="跳到底部">
                      <i class="fa-solid fa-arrow-down"></i>
                    </button>
                  </div>
                </div>
                <nav class="space-y-1">
                  <a v-for="item in toc" :key="item.id" 
                  @click.prevent="scrollToHeading(item.id)"
                  class="block py-0.5 text-sm cursor-pointer truncate transition border-l-2"
                  :class="activeHeadingId === item.id ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 font-black' : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border-transparent'"
                  :style="{ paddingLeft: ((item.level - 1) * 12 + 8) + 'px' }"
                  :title="item.text">
                      {{ item.text }}
                  </a>
                </nav>
              </div>

              <!-- Floating TOC Button (visible on small screens or in both mode) -->
              <div v-if="toc.length > 0 && (mode === 'view' || mode === 'both') && !showFloatingToc" 
                   class="fixed right-0 top-40 z-40"
                   :class="{ 'lg:hidden': mode === 'view' }">
                <button 
                  @click="toggleFloatingToc"
                  class="bg-gray-100 dark:bg-gray-700 hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 border-r-0 rounded-l-md shadow-md py-3 px-1.5 cursor-pointer flex flex-col items-center gap-1"
                  title="顯示目錄">
                  <i class="fa-solid fa-list text-xs"></i>
                  <span class="text-xs" style="writing-mode: vertical-rl;">目錄</span>
                </button>
              </div>

              <!-- Floating TOC Panel -->
              <Transition name="slide-right">
                <div v-if="showFloatingToc" 
                    class="absolute inset-0 z-20" 
                    :class="{ 'lg:hidden': mode === 'view' }"
                    @click="showFloatingToc = false">
                  <div class="absolute inset-0 bg-black/50"></div>
                  <div class="absolute right-0 top-0 h-full w-72 bg-white dark:bg-dark-surface shadow-xl overflow-y-auto" 
                      @click.stop>
                    <!-- Panel Header -->
                    <div class="p-4 border-b dark:border-gray-700 flex items-center justify-between">
                      <h3 class="text-sm font-bold text-gray-800 dark:text-white">
                        <i class="fa-solid fa-list mr-2"></i>目錄
                      </h3>
                      <div class="flex items-center space-x-1">
                        <button @click="scrollToTop" class="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="回到頂部">
                          <i class="fa-solid fa-arrow-up"></i>
                        </button>
                        <button @click="scrollToBottom" class="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="跳到底部">
                          <i class="fa-solid fa-arrow-down"></i>
                        </button>
                      </div>
                    </div>
                    <!-- TOC Content -->
                    <nav class="p-4 space-y-1">
                      <a v-for="item in toc" :key="item.id" 
                        @click.prevent="scrollToHeadingAndCloseToc(item.id)"
                        class="block py-1.5 text-sm cursor-pointer transition border-l-2"
                        :class="activeHeadingId === item.id 
                          ? 'text-blue-600 dark:text-blue-400 border-blue-600 font-semibold' 
                          : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border-transparent'"
                        :style="{ paddingLeft: ((item.level - 1) * 12 + 8) + 'px' }">
                        {{ item.text }}
                      </a>
                    </nav>
                  </div>
                </div>
              </Transition>
            </div>
            </div>
          </div>
      </template>

      <!-- Not Found -->
      <div v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <i class="fa-solid fa-file-circle-question text-6xl text-gray-300 mb-4"></i>
          <p class="text-gray-500">找不到此筆記</p>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <SettingsModal 
      :show="showSettingsModal" 
      :user="currentUser" 
      :theme="theme" 
      :app-version="appVersion"
      :initial-tab="settingsInitialTab"
      :ai-enabled="aiEnabled"
      @close="showSettingsModal = false; settingsInitialTab = ''"
      @set-theme="setTheme"
      @logout="logout"
      @open-about="showAboutModal = true"
      @user-updated="handleUserProfileUpdate"
      @update:hideAiFloatingButton="hideAiFloatingButton = $event"
    />
    
    <AboutModal :show="showAboutModal" :app-version="appVersion" @close="showAboutModal = false" />
    
    <CreateBookModal 
      :show="showCreateBookModal"
      @close="showCreateBookModal = false"
      @book-created="handleCreateBook"
    />
    
    <RevisionsModal 
      :show="showRevisionsModal"
      :note-id="note?.id"
      :note-title="note?.title"
      :can-edit="canEdit"
      :current-content="content"
      @close="showRevisionsModal = false"
      @restore="handleRevisionRestore"
    />
    
    <InfoModal
      :show="showNoteInfoModal"
      type="note"
      :item="noteInfoItem"
      :tab="noteInfoModalTab"
      :editable-permission="permission"
      :comments-enabled="noteCommentsEnabled"
      :editable-tags="note?.tags || []"
      :user-permissions="userPermissions"
      :loading-user-permissions="loadingUserPermissions"
      :user-search-query="userSearchQuery"
      :user-search-results="userSearchResults"
      :new-user-permission="newUserPermission"
      :books="books"
      @close="showNoteInfoModal = false"
      @update:tab="noteInfoModalTab = $event"
      @update:permission="handlePermissionChange"
      @update:commentsEnabled="autoSaveCommentsEnabled"
      @update:isPublic="autoSaveIsPublic"
      @update:shareId="handleShareIdUpdate"
      @update:shareAlias="handleShareAliasUpdate"
      @update:newUserPermission="newUserPermission = $event"
      @search-users="(q) => { userSearchQuery = q; searchUsers(); }"
      @add-user-permission="addUserPermission"
      @remove-user-permission="removeUserPermission"
      @update-user-permission="updateUserPermissionLevel"
      @move-note="moveNoteToBook"
      @export-markdown="exportAsMarkdown"
      @export-pdf="exportAsPDF"
    />

    <ImageLightbox 
      :image="lightboxImage"
      @close="closeLightbox"
    />

    <!-- Export Modal -->
    <Transition name="modal">
      <div v-if="showExportModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="showExportModal = false">
        <div class="absolute inset-0 bg-black/60"></div>
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <h3 class="text-lg font-bold text-gray-800 dark:text-white">
              <i class="fa-solid fa-file-export mr-2"></i>匯出筆記
            </h3>
            <button @click="showExportModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
              <i class="fa-solid fa-times text-xl"></i>
            </button>
          </div>
          <!-- Content -->
          <div class="p-6 space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">選擇匯出格式：</p>
            <div class="grid grid-cols-2 gap-4">
              <!-- Markdown Export -->
              <button @click="exportAsMarkdown" 
                      class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition cursor-pointer group">
                <i class="fa-brands fa-markdown text-4xl text-gray-400 group-hover:text-blue-500 mb-3 transition"></i>
                <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">Markdown</span>
                <span class="text-xs text-gray-400 mt-1">.md 檔案</span>
              </button>
              <!-- PDF Export -->
              <button @click="exportAsPDF" 
                      class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer group">
                <i class="fa-solid fa-file-pdf text-4xl text-gray-400 group-hover:text-red-500 mb-3 transition"></i>
                <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400">PDF</span>
                <span class="text-xs text-gray-400 mt-1">.pdf 檔案</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- AI Assistant Button (shown when floating button is not hidden) -->
    <AiAssistantButton 
      v-if="aiEnabled && !hideAiFloatingButton"
      :note-content="content"
      :note-title="note?.title"
    />

    <!-- AI Assistant Chat from Menu (shown when floating button is hidden and user clicks menu) -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <AiAssistantChat
        v-if="aiEnabled && hideAiFloatingButton && showAiChatFromMenu"
        :note-content="content"
        :note-title="note?.title"
        @close="showAiChatFromMenu = false"
      />
    </Transition>
  </div>
</template>

<style>
.note-sidebar-slide-enter-active,
.note-sidebar-slide-leave-active {
  transition: opacity 0.3s ease;
}
.note-sidebar-slide-enter-active > div:first-child,
.note-sidebar-slide-leave-active > div:first-child {
  transition: opacity 0.3s ease;
}
.note-sidebar-slide-enter-active > div:last-child,
.note-sidebar-slide-leave-active > div:last-child {
  transition: transform 0.3s ease;
}
.note-sidebar-slide-enter-from,
.note-sidebar-slide-leave-to {
  opacity: 0;
}
.note-sidebar-slide-enter-from > div:last-child,
.note-sidebar-slide-leave-to > div:last-child {
  transform: translateX(-100%);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
}
.slide-right-enter-from > div:last-child,
.slide-right-leave-to > div:last-child {
  transform: translateX(100%);
}

.editor-container { height: 100%; }
.editor-container .cm-editor { height: 100%; }
.editor-container .cm-scroller { overflow: auto; }
.editor-container .cm-content { font-family: 'Fira Code', monospace; font-size: 16px; line-height: 1.6; padding: 4px; }
.editor-container .cm-line { padding: 0 4px; }
.editor-container .cm-gutters { 
  font-family: 'Fira Code', monospace; 
  font-size: 16px; 
  line-height: 1.6; 
  background-color: transparent; 
  border-right: 1px solid #e5e5e5; 
}

.dark .editor-container .cm-gutters { border-color: #3c3c3c; }

.markdown-body { font-size: 16px; line-height: 1.6; }
.markdown-body h1 { font-size: 2em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.3em; scroll-margin-top: 3rem; }
.markdown-body h2 { font-size: 1.5em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.3em; scroll-margin-top: 3rem; }
.markdown-body h3 { font-size: 1.25em; margin-top: 0.67em; margin-bottom: 0.5em; font-weight: bold; scroll-margin-top: 3rem; }
.markdown-body h4, .markdown-body h5, .markdown-body h6 { margin-top: 0.33em; margin-bottom: 0.33em; font-weight: bold; scroll-margin-top: 3rem; }
.markdown-body p { margin: 1em 0; }
.markdown-body ul, .markdown-body ol { margin: 0.2em 0; padding-left: 2em; }
.markdown-body code { background: #e8e8e8; padding: 0.2em 0.4em; margin: 0 0.4em; border-radius: 3px; font-size: 0.9em; }
.markdown-body pre { margin: 1em 0; border-radius: 6px; overflow: auto; }
.markdown-body pre code { background: none; padding: 0; margin: 0; }
.markdown-body pre.hljs { padding: 8px 12px; line-height: 1.45; }
.markdown-body blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
.markdown-body blockquote p { margin: 0.5em 0; }
.markdown-body table { border-collapse: collapse; margin: 1em 0; }
.markdown-body th, .markdown-body td { border: 1px solid #ddd; padding: 0.5em 1em; }
.markdown-body a { color: #0366d6; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body img { max-width: 100%; border-radius: 4px; }
.markdown-body hr { margin: 24px 0;}

.dark .markdown-body code { background: #505050; }
.dark .markdown-body pre.hljs { }
.dark .markdown-body blockquote { border-color: #444; color: #aaa; }
.dark .markdown-body th, .dark .markdown-body td { border-color: #444; }
.dark .markdown-body a { color: #58a6ff; }


/* Spoiler / Details */
.markdown-body details {
    border: 1px solid #e1e4e8;
    border-radius: 6px;
    padding: 0.5em 0.5em 0;
    margin-bottom: 1em;
}
.dark .markdown-body details {
    border-color: #444;
}
.markdown-body summary {
    cursor: pointer;
    font-weight: bold;
    padding-bottom: 0.5em;
    outline: none;
}
.markdown-body details[open] {
    padding-bottom: 0.5em;
}
.markdown-body details[open] summary {
    border-bottom: 1px solid #e1e4e8;
    margin-bottom: 0.5em;
}
.dark .markdown-body details[open] summary {
    border-bottom-color: #444;
}

/* Mark */
.markdown-body mark {
    background-color: #ffeb3b;
    color: #000;
    padding: 0.1em 0.2em;
    border-radius: 2px;
}
.dark .markdown-body mark {
    background-color: #fbc02d;
    color: #000;
}

/* Code Block Word Wrap */
.hljs.code-wrap,
.hljs.code-wrap code {
    white-space: pre-wrap;
    word-wrap: break-word;
    word-break: break-all;
}

/* Code Block Line Numbers */
.markdown-body pre.hljs.has-line-numbers {
    padding: 0;
}

.hljs.has-line-numbers code {
    display: flex;
    padding: 0;
}

.hljs.has-line-numbers .code-line-numbers {
    flex-shrink: 0;
    padding: 8px 12px;
    text-align: right;
    user-select: none;
    color: #6e7681;
    background-color: rgba(0, 0, 0, 0.05);
    border-right: 1px solid rgba(0, 0, 0, 0.1);
    font-family: inherit;
    font-size: inherit;
    line-height: 1.45;
}

.hljs.has-line-numbers .code-line-number {
    display: block;
    min-width: 1.2em;
}

.hljs.has-line-numbers .code-content {
    flex: 1;
    padding: 8px 12px;
    overflow-x: auto;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.45;
}

.hljs.has-line-numbers .code-line {
    display: block;
}

/* Word wrap with line numbers */
.hljs.has-line-numbers.code-wrap .code-content {
    white-space: pre-wrap;
    word-wrap: break-word;
    word-break: break-all;
    overflow-x: visible;
}

/* Dark mode line numbers */
.dark .hljs.has-line-numbers .code-line-numbers {
    color: #6e7681;
    background-color: rgba(255, 255, 255, 0.05);
    border-right-color: rgba(255, 255, 255, 0.1);
}

/* CM6 Autocomplete Hints Customization - Legacy Style Match */
.cm-tooltip.cm-tooltip-autocomplete {
    background-color: #ffffff !important;
    border: 1px solid #e1e4e8 !important;
    border-radius: 6px !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
    padding: 2px !important;
    font-family: 'Fira Code', monospace !important;
    font-size: 14px !important;
}

.cm-tooltip.cm-tooltip-autocomplete > ul > li {
    padding: 6px 12px !important;
    color: #24292e !important;
    border-radius: 4px !important;
    cursor: pointer !important;
    transition: background-color 0.1s ease !important;
}

.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] {
    background-color: #2563eb !important;
    color: #ffffff !important;
}

/* Dark mode overrides */
.dark .cm-tooltip.cm-tooltip-autocomplete {
    background-color: #1f2937 !important;
    border: 1px solid #374151 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
}

.dark .cm-tooltip.cm-tooltip-autocomplete > ul > li {
    color: #e5e7eb !important;
}

.dark .cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] {
    background-color: #3b82f6 !important;
    color: #ffffff !important;
}

/* Hide completion type icon/info if present to match legacy text-only look */
.cm-completionIcon {
    display: none !important;
}
.cm-completionDetail {
    color: #6b7280;
    margin-left: 0.5em;
    font-style: italic;
    opacity: 0.8;
}

/* Code Block Wrapper & Header */
.code-block-wrapper {
    position: relative;
    margin: 1em 0;
    border-radius: 6px;
    background-color: #282c34; /* Match OneDark background */
    overflow: hidden; /* Ensure header radius is respected */
}

/* Override default pre margin since wrapper handles it */
.markdown-body .code-block-wrapper pre {
    padding: 12px 16px;
    margin: 0;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
}

.code-block-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    background-color: #f4f4f4;
    padding: 4px 12px;
    border-bottom: 1px solid #d3d3d3;
    font-size: 0.75rem;
}
.dark .code-block-header {
    background-color: #2D2D2D;
    border-bottom: 1px solid #181a1f;
}

.code-lang {
    color: #8a9298;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
}
.dark .code-lang {
    color: #abb2bf;
}

/* Code Copy Button */
.code-copy-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    color: #8a9298;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.2s ease;
    font-size: 0.75rem;
}
.code-copy-btn:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: #4b5563;
}
.code-copy-btn.copied {
    color: #10b981;
}
.dark .code-copy-btn {
    color: #6b7280;
}
.dark .code-copy-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: #d1d5db;
}
.dark .code-copy-btn.copied {
    color: #34d399;
}

/* Tabs Container Styles */
.tabs-container {
    margin: 1rem 0;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
}
.dark .tabs-container {
    border-color: #374151;
}

.tabs-header {
    display: flex;
    flex-wrap: wrap;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    gap: 2px;
    padding: 4px;
}
.dark .tabs-header {
    background: #1f2937;
    border-bottom-color: #374151;
}

.tab-btn {
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 6px;
    transition: all 0.2s ease;
}
.tab-btn:hover {
    background: #e5e7eb;
    color: #374151;
}
.dark .tab-btn {
    color: #9ca3af;
}
.dark .tab-btn:hover {
    background: #374151;
    color: #e5e7eb;
}

.tab-btn.active {
    background: #3b82f6;
    color: white;
}
.dark .tab-btn.active {
    background: #2563eb;
}

.tab-content {
    display: none;
    padding: 16px;
}
.tab-content.active {
    display: block;
}
</style>

