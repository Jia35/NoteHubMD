<script setup>
/**
 * NoteView - 筆記編輯頁 (完整版)
 * 使用 CodeMirror 6 編輯器與 markdown-it 渲染器
 */
import { ref, computed, onMounted, onUnmounted, inject, watch, nextTick, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { useSocket } from '@/composables/useSocket'
import dayjs from 'dayjs'
import relativeTimePlugin from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTimePlugin)
dayjs.locale('zh-tw')

// Components
import { SidebarNav, InfoModal, SettingsModal, AboutModal, UserProfileModal, CreateBookModal, RevisionsModal, ImageLightbox } from '@/components'

// CodeMirror 6
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  androidstudio, atomone, aura, copilot, darcula, eclipse, githubLight,
  githubDark, gruvboxDark, kimbie, material, monokai, monokaiDimmed, noctisLilac,
  okaidia, quietlight, solarizedLight, solarizedDark, sublime, tokyoNightDay,
  tomorrowNightBlue, vscodeDark, whiteLight, xcodeLight, xcodeDark
} from '@uiw/codemirror-themes-all'

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
import markdownItTaskLists from 'markdown-it-task-lists'

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
import 'highlight.js/styles/github-dark.css'

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

// Stats
const charCount = computed(() => content.value.length)
const lineCount = computed(() => content.value.split('\n').length)
const selectedLines = ref(0)
const selectedChars = ref(0)
const isSyncingLeft = ref(false)
const isSyncingRight = ref(false)

// Socket
const { socket, joinNote, leaveNote, editNote, onNoteUpdated, offNoteUpdated, onUsersInNote, offUsersInNote } = useSocket()
const onlineUsers = ref([])
const showOnlineUsersPopup = ref(false)

// Sidebar data
const books = ref([])
const pinnedItems = ref([])
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')

// Modals
const showSettingsModal = ref(false)
const showAboutModal = ref(false)
const showUserProfileModal = ref(false)
const showCreateBookModal = ref(false)
const showNoteInfoModal = ref(false)
const showRevisionsModal = ref(false)
const noteInfoModalTab = ref('info')

// Settings
const theme = ref(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
const appVersion = ref('')

// Editor Theme
const editorThemes = [
  // Defaults
  { label: '[預設] Default', value: 'default', theme: [] },

  // Dark Themes
  // { label: '[深色] Abcdef', value: 'abcdef', theme: abcdef },
  // { label: '[深色] Abyss', value: 'abyss', theme: abyss },
  { label: '[深色] Android Studio', value: 'androidstudio', theme: androidstudio },
  // { label: '[深色] Andromeda', value: 'andromeda', theme: andromeda },
  { label: '[深色] Atom One', value: 'atom-one', theme: atomone },
  { label: '[深色] Aura', value: 'aura', theme: aura },
  // { label: '[深色] Bespin', value: 'bespin', theme: bespin },
  // { label: '[深色] Console', value: 'console', theme: consoleDark },
  { label: '[深色] Copilot', value: 'copilot', theme: copilot },
  { label: '[深色] Darcula', value: 'darcula', theme: darcula },
  // { label: '[深色] Dracula', value: 'dracula', theme: dracula },
  // { label: '[深色] Duotone Dark', value: 'duotone-dark', theme: duotoneDark },
  { label: '[深色] GitHub Dark', value: 'github-dark', theme: githubDark },
  { label: '[深色] Gruvbox Dark', value: 'gruvbox-dark', theme: gruvboxDark },
  { label: '[深色] Kimbie', value: 'kimbie', theme: kimbie },
  { label: '[深色] Material', value: 'material', theme: material },
  { label: '[深色] Monokai', value: 'monokai', theme: monokai },
  { label: '[深色] Monokai Dimmed', value: 'monokai-dimmed', theme: monokaiDimmed },
  // { label: '[深色] Nord', value: 'nord', theme: nord },
  { label: '[深色] Okaidia', value: 'okaidia', theme: okaidia },
  { label: '[深色] One Dark', value: 'one-dark', theme: oneDark },
  // { label: '[深色] Red', value: 'red', theme: red },
  { label: '[深色] Solarized Dark', value: 'solarized-dark', theme: solarizedDark },
  { label: '[深色] Sublime', value: 'sublime', theme: sublime },
  // { label: '[深色] Tokyo Night', value: 'tokyo-night', theme: tokyoNight },
  // { label: '[深色] Tokyo Night Storm', value: 'tokyo-night-storm', theme: tokyoNightStorm },
  { label: '[深色] Tomorrow Night Blue', value: 'tomorrow-night-blue', theme: tomorrowNightBlue },
  { label: '[深色] VS Code Dark', value: 'vscode-dark', theme: vscodeDark },
  { label: '[深色] Xcode Dark', value: 'xcode-dark', theme: xcodeDark },

  // Light Themes
  // { label: '[亮色] BBEdit', value: 'bbedit', theme: bbedit },
  // { label: '[亮色] Duotone Light', value: 'duotone-light', theme: duotoneLight },
  { label: '[亮色] Eclipse', value: 'eclipse', theme: eclipse },
  { label: '[亮色] GitHub Light', value: 'github-light', theme: githubLight },
  // { label: '[亮色] Gruvbox Light', value: 'gruvbox-light', theme: gruvboxLight },
  { label: '[亮色] Noctis Lilac', value: 'noctis-lilac', theme: noctisLilac },
  { label: '[亮色] Quiet Light', value: 'quiet-light', theme: quietlight },
  { label: '[亮色] Solarized Light', value: 'solarized-light', theme: solarizedLight },
  { label: '[亮色] Tokyo Night Day', value: 'tokyo-night-day', theme: tokyoNightDay },
  { label: '[亮色] White', value: 'white', theme: whiteLight },
  { label: '[亮色] Xcode Light', value: 'xcode-light', theme: xcodeLight },
]

const selectedEditorTheme = ref(localStorage.getItem('NoteHubMD-editorTheme') || (theme.value === 'dark' ? 'monokai' : 'default'))
const themeCompartment = new Compartment()

watch(selectedEditorTheme, (newVal) => {
  localStorage.setItem('NoteHubMD-editorTheme', newVal)
  if (editorView.value) {
    const themeItem = editorThemes.find(t => t.value === newVal)
    const themeExtension = themeItem ? themeItem.theme : []
    editorView.value.dispatch({
      effects: themeCompartment.reconfigure(themeExtension)
    })
  }
})



// Permission options
const permissionOptions = [
  { value: 'public-edit', label: '可編輯' },
  { value: 'auth-edit', label: '可編輯(需登入)' },
  { value: 'public-view', label: '唯讀' },
  { value: 'auth-view', label: '唯讀(需登入)' },
  { value: 'private', label: '私人' }
]

// Comments
const comments = ref([])
const noteCommentsEnabled = ref(true)

// Note owner/editor info
const noteOwner = ref(null)
const lastEditor = ref(null)
const lastContentEditedAt = ref(null)

// TOC
const toc = ref([])

// Resizable
const isResizing = ref(false)
const contentArea = ref(null)

// Info modal data
const userPermissions = ref([])
const loadingUserPermissions = ref(false)
const userSearchQuery = ref('')
const userSearchResults = ref([])
const newUserPermission = ref('view')

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

// Markdown-it setup
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})
  .use(markdownItAnchor, { permalink: false })
  .use(markdownItEmoji)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItIns)
  .use(markdownItTaskLists, { enabled: true, label: true })
  .use(markdownItImsize)

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
      api.getPinnedItems().catch(() => []),
      api.getAppVersion().catch(() => ({ version: '' }))
    ])
    books.value = booksData
    pinnedItems.value = pinnedData
    appVersion.value = versionData.version || ''
    
    const data = await api.getNote(route.params.id)
    note.value = data
    content.value = data.content || ''
    isOwner.value = data.isOwner || false
    canEdit.value = data.canEdit || false
    permission.value = data.permission || 'private'
    book.value = data.book || null
    noteCommentsEnabled.value = data.commentsEnabled !== false
    noteOwner.value = data.owner || null
    lastEditor.value = data.lastEditor || null
    lastContentEditedAt.value = data.lastContentEditedAt || data.updatedAt || null
    
    document.title = `${(data.title || 'Untitled').substring(0, 20)} | NoteHubMD`
    
    renderMarkdown()
    
    if (canEdit.value) {
      // Delay editor init to ensure DOM is ready
      nextTick(() => {
        setTimeout(() => {
          initEditor()
        }, 100)
      })
    }
    
    // Load comments
    if (noteCommentsEnabled.value) {
      comments.value = await api.getComments(route.params.id).catch(() => [])
    }
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
    
    if (note.value && canEdit.value) {
      const username = currentUser.value?.username || 'Guest'
      joinNote(note.value.id, username)
      
      onUsersInNote((users) => {
        onlineUsers.value = users
      })
      
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
    }
  }
}

// Init CodeMirror
const initEditor = () => {
  console.log('initEditor called', { editorContainer: editorContainer.value, editorView: editorView.value })
  if (!editorContainer.value) {
    console.warn('Editor container not found, retrying...')
    setTimeout(initEditor, 100)
    return
  }
  if (editorView.value) return
  
  const isDark = document.documentElement.classList.contains('dark')
  
  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    markdown(),
    placeholder('開始編輯筆記...'),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    themeCompartment.of(editorThemes.find(t => t.value === selectedEditorTheme.value)?.theme || []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        content.value = update.state.doc.toString()
        debouncedSave()
        renderMarkdown()
        if (note.value) {
          editNote(note.value.id, content.value)
        }
      }
      
      // Update selection stats
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
      }
    }),
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
    })
  ]
  

  
  editorView.value = new EditorView({
    state: EditorState.create({
      doc: content.value,
      extensions
    }),
    parent: editorContainer.value
  })
  console.log('Editor created successfully')
}

// Render markdown and generate TOC
const renderMarkdown = () => {
  renderedContent.value = md.render(content.value)
  
  // Generate TOC from headings
  nextTick(() => {
    if (previewContent.value) {
      const headings = previewContent.value.querySelectorAll('h1, h2, h3, h4, h5, h6')
      toc.value = Array.from(headings).map((h, idx) => ({
        id: h.id || `heading-${idx}`,
        text: h.textContent,
        level: parseInt(h.tagName[1])
      }))
      // Ensure all headings have IDs
      headings.forEach((h, idx) => {
        if (!h.id) h.id = `heading-${idx}`
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

// Scroll to TOC item
const scrollToHeading = (id) => {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// Image Lightbox Logic
const lightboxImage = ref(null)
const lightboxZoom = ref(1)
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_STEP = 0.25

const handlePreviewClick = (event) => {
  const target = event.target
  
  // Handle task list checkbox click (if we implement it later)
  
  // Handle image clicks
  if (target.tagName === 'IMG' && !target.closest('.mermaid')) {
    lightboxImage.value = target.src
    lightboxZoom.value = 1
  }
}

const closeLightbox = () => {
    lightboxImage.value = null
    lightboxZoom.value = 1
}

const zoomIn = () => {
    if (lightboxZoom.value < MAX_ZOOM) {
        lightboxZoom.value = Math.min(MAX_ZOOM, lightboxZoom.value + ZOOM_STEP)
    }
}

const zoomOut = () => {
    if (lightboxZoom.value > MIN_ZOOM) {
        lightboxZoom.value = Math.max(MIN_ZOOM, lightboxZoom.value - ZOOM_STEP)
    }
}

const handleLightboxWheel = (event) => {
    if (event.deltaY < 0) {
        zoomIn()
    } else {
        zoomOut()
    }
}

// Paste Handling
const handlePaste = async (event, view) => {
  const items = event.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const file = item.getAsFile()
      if (!file) continue

      try {
        const res = await api.uploadImage(file)
        const markdown = `![image](${res.url})`
        const transaction = view.state.update({
          changes: { from: view.state.selection.main.from, insert: markdown }
        })
        view.dispatch(transaction)
      } catch (error) {
        console.error('Image upload failed:', error)
        showAlert?.('圖片上傳失敗：' + error.message, 'error')
      }
      return true
    }
  }
}

const handleDrop = async (event, view) => {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) return

  event.preventDefault()
  
  for (const file of imageFiles) {
    try {
      const res = await api.uploadImage(file)
      const markdown = `![${file.name}](${res.url})`
      
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      const insertPos = pos ? pos : view.state.selection.main.from
      
      const transaction = view.state.update({
        changes: { from: insertPos, insert: markdown + '\n' }
      })
      view.dispatch(transaction)
    } catch (error) {
       console.error('Image upload failed:', error)
       showAlert?.('圖片上傳失敗：' + error.message, 'error')
    }
  }
}

// Sync Scroll
const syncScrollFromEditor = (target) => {
  if (!previewContainer.value || mode.value !== 'both') return
  const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight)
  const preview = previewContainer.value
  preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight)
}

const syncScrollFromPreview = (e) => {
  if (!editorView.value || isSyncingRight.value || mode.value !== 'both') return
  isSyncingLeft.value = true
  const preview = e.target
  const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight)
  const scroller = editorView.value.scrollDOM
  if (scroller) {
    scroller.scrollTop = percentage * (scroller.scrollHeight - scroller.clientHeight)
  }
  isSyncingLeft.value = false
}

// --- Markdown Toolbar Functions ---
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
const toggleInlineCode = () => toggleWrap('`')

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

// Debounced save
let saveTimeout = null
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveNote, 1000)
}

// Save note
const saveNote = async () => {
  if (!note.value || !canEdit.value) return
  saving.value = true
  try {
    await api.updateNote(note.value.id, { content: content.value })
  } catch (e) {
    console.error('Failed to save note:', e)
  } finally {
    saving.value = false
  }
}

// Set mode
const setMode = (m) => {
  mode.value = m
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

// Unpin
const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id))
  } catch (e) {
    showAlert?.('取消釘選失敗', 'error')
  }
}

// Share note
const shareNote = () => {
  noteInfoModalTab.value = 'share'
  showNoteInfoModal.value = true
}

// Toggle online users popup
const toggleOnlineUsersPopup = () => {
  showOnlineUsersPopup.value = !showOnlineUsersPopup.value
}

// Handle permission change
const handlePermissionChange = async (newPerm) => {
  try {
    await api.updatePermission(note.value.id, newPerm)
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

// Format date
const formatDate = (date) => dayjs(date).format('YYYY/MM/DD HH:mm')
const getRelativeTime = (date) => dayjs(date).fromNow()

// Lifecycle
onMounted(() => loadNote())

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
  if (editorView.value) {
    editorView.value.destroy()
    editorView.value = null
  }
  if (note.value) {
    leaveNote(note.value.id)
    offNoteUpdated()
    offUsersInNote()
  }
})

// Watch route
watch(() => route.params.id, (newId, oldId) => {
  if (oldId) {
    leaveNote(oldId)
    offNoteUpdated()
    offUsersInNote()
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
            @unpin="unpinItem"
            @view-mode-change="setGlobalViewMode"
            @create-note="createNewNote"
            @create-book="showCreateBookModal = true"
            @open-profile="showUserProfileModal = true"
            @open-settings="showSettingsModal = true"
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
        <div class="bg-gray-200 dark:bg-gray-900 dark:text-white px-3 py-2 flex items-center shadow-md z-30 shrink-0">
          <div class="flex-1 flex items-center space-x-2">
            <template v-if="book">
              <a :href="'/b/' + book.id" class="hover:text-blue-400 transition">
                <i class="fa-solid fa-book mr-1"></i>{{ book.title }}
              </a>
              <span class="text-gray-600">/</span>
            </template>
            <span class="text-sm bg-gray-300 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-xs">
              <i class="fa-solid fa-note-sticky mr-1"></i>{{ note.title || 'Untitled' }}
            </span>
            <span v-if="saving" class="text-xs text-gray-400 ml-2">Saving...</span>
            <span v-else class="text-xs text-gray-500 ml-2">Saved</span>
          </div>
          
          <!-- Mode Toggle -->
          <div class="flex bg-gray-300 dark:bg-gray-800 rounded-lg p-0.5 space-x-0.5">
            <button @click="setMode('edit')" class="w-7 h-7 flex items-center justify-center rounded transition text-sm cursor-pointer" 
                    :class="mode === 'edit' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-400 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'" title="Edit">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button @click="setMode('both')" class="w-7 h-7 flex items-center justify-center rounded transition text-sm cursor-pointer" 
                    :class="mode === 'both' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-400 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'" title="Both">
              <i class="fa-solid fa-columns"></i>
            </button>
            <button @click="setMode('view')" class="w-7 h-7 flex items-center justify-center rounded transition text-sm cursor-pointer" 
                    :class="mode === 'view' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-black hover:bg-gray-400 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700'" title="View">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          
          <!-- Right Actions -->
          <div class="flex-1 flex justify-end items-center space-x-3">
            <!-- Online Users -->
            <div class="relative">
              <button @click="toggleOnlineUsersPopup" 
                      class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
                <i class="fa-solid fa-users text-xs"></i>
                <span class="font-medium">{{ onlineUsers.length }}</span>
              </button>
              <div v-if="showOnlineUsersPopup" class="absolute right-0 top-full mt-2 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700 z-50">
                <div class="p-3">
                  <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
                    <i class="fa-solid fa-users mr-1"></i> 在線用戶 ({{ onlineUsers.length }})
                  </div>
                  <ul class="space-y-1 max-h-48 overflow-y-auto">
                    <li v-for="(user, index) in onlineUsers" :key="index" class="flex items-center text-sm text-gray-800 dark:text-gray-200 py-1">
                      <span class="w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-medium text-white shrink-0"
                            :class="user.username && user.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                        {{ user.username?.charAt(0).toUpperCase() || '?' }}
                      </span>
                      <span class="truncate">{{ user.username || 'Guest' }}</span>
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
            
            <!-- Note Settings -->
            <button @click="noteInfoModalTab = 'info'; showNoteInfoModal = true;" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
              <i class="fa-solid fa-cog text-xs"></i>
              <span>筆記設定</span>
            </button>
            
            <!-- Activity Log -->
            <button @click="showRevisionsModal = true" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
              <i class="fa-solid fa-history text-xs"></i>
              <span>活動紀錄</span>
            </button>
            
            <!-- Share -->
            <button v-if="canEdit || isOwner" @click="shareNote" 
                    class="flex items-center space-x-1 bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm text-white transition cursor-pointer">
              <i class="fa-solid fa-share-alt text-xs"></i>
              <span>分享</span>
            </button>
          </div>
        </div>
        
        <!-- Content Area -->
        <div ref="contentArea" class="flex-1 flex overflow-hidden relative">
          <!-- Editor -->
          <div v-show="showEditor" class="h-full flex flex-col" 
               :class="showPreview ? 'border-r border-gray-300 dark:border-gray-700' : ''"
               :style="showPreview ? { width: editorWidth + '%' } : { width: '100%' }">
            
            <!-- Markdown Toolbar -->
            <div v-if="canEdit" class="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-1 py-1.5 flex items-center gap-1 shrink-0 z-20 overflow-x-auto custom-scrollbar">
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
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5"></div>
                <button @click="toggleInlineCode" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Inline Code">
                    <i class="fa-solid fa-code"></i>
                </button>
                <button @click="insertCodeBlock" class="p-0.5 px-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors text-sm" title="Code Block">
                    <i class="fa-solid fa-file-code"></i>
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

            <div v-if="canEdit" ref="editorContainer" class="flex-1 overflow-hidden relative editor-container"></div>
            <div v-else class="flex-1 flex items-center justify-center text-gray-500">
              <i class="fa-solid fa-lock mr-2"></i>您沒有編輯權限
            </div>
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
                <option v-for="t in editorThemes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
          </div>
          
          <!-- Resizable Divider (only in Both mode) -->
          <div v-if="showEditor && showPreview" 
               class="w-1 bg-gray-300 hover:bg-blue-400 dark:bg-gray-700 dark:hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-10"
               @mousedown="startResize"
               title="拖曳調整寬度"></div>
          
          <!-- Preview with TOC -->
          <div v-show="showPreview" class="h-full flex min-w-0 flex-1">
            <!-- Preview Content -->
            <div class="h-full flex flex-col flex-1 overflow-auto bg-white dark:bg-dark-bg" ref="previewContainer" @scroll="syncScrollFromPreview" @click="handlePreviewClick">
              <!-- Preview Info Bar -->
              <div class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 text-xs text-gray-500 dark:text-gray-400 shrink-0 sticky top-0 z-20"
                   :class="{'flex justify-center': !showEditor}">
                <div :class="{'w-full px-8': !showEditor, 'px-4': showEditor}" :style="!showEditor ? 'max-width: 800px' : ''">
                  <div class="flex items-center space-x-4">
                    <!-- Owner -->
                    <div v-if="noteOwner" class="flex items-center">
                      <div class="relative group mr-1.5">
                        <span class="w-5 h-5 rounded-full flex items-center justify-center font-medium text-white shrink-0 overflow-hidden cursor-help"
                              style="font-size: 10px;"
                              :class="noteOwner.username && noteOwner.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                          <img v-if="noteOwner.avatar" :src="noteOwner.avatar" class="w-full h-full object-cover" alt="">
                          <template v-else>{{ noteOwner.username?.charAt(0).toUpperCase() || '?' }}</template>
                        </span>
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
                      <span>{{ noteOwner.name || noteOwner.username || '?' }} 擁有這篇筆記</span>
                    </div>
                    <!-- Last Editor -->
                    <div v-if="lastEditor" class="flex items-center">
                      <div class="relative group mr-1.5">
                        <span class="w-5 h-5 rounded-full flex items-center justify-center font-medium text-white shrink-0 overflow-hidden cursor-help"
                              style="font-size: 10px;"
                              :class="lastEditor.username && lastEditor.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                          <img v-if="lastEditor.avatar" :src="lastEditor.avatar" class="w-full h-full object-cover" alt="">
                          <template v-else>{{ lastEditor.username?.charAt(0).toUpperCase() || '?' }}</template>
                        </span>
                        <!-- Editor Tooltip -->
                        <div class="absolute top-full left-0 mt-2 hidden group-hover:block z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600" style="min-width: 200px;">
                          <div class="absolute -top-2 left-2 w-4 h-4 bg-white dark:bg-gray-800 border-t border-l border-gray-200 dark:border-gray-600 transform rotate-45"></div>
                          <div class="flex items-center relative z-10">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center mr-3 overflow-hidden shrink-0 border-2 border-gray-100 dark:border-gray-600"
                                 :class="lastEditor.username && lastEditor.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                              <img v-if="lastEditor.avatar" :src="lastEditor.avatar" class="w-full h-full object-cover">
                              <span v-else class="text-xl text-white font-bold">{{ lastEditor.username?.charAt(0).toUpperCase() || '?' }}</span>
                            </div>
                            <div>
                              <div class="font-bold text-gray-900 dark:text-white text-base">{{ lastEditor.name || lastEditor.username || 'Guest' }}</div>
                              <div class="text-xs text-gray-500 dark:text-gray-400">@{{ lastEditor.username || 'guest' }}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <span>{{ lastEditor.name || lastEditor.username || '?' }} 編輯</span>
                    </div>
                    <!-- Last Edited Time -->
                    <div v-if="relativeLastEditedTime" class="flex items-center">
                      <i class="fa-solid fa-pen mr-1 text-gray-400"></i>
                      <span>編輯於 {{ relativeLastEditedTime }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <!-- Preview Content -->
              <div class="markdown-body dark:text-gray-300"
                   :class="{'flex justify-center': !showEditor, 'has-toc': toc.length > 0 && mode === 'view' && !showEditor}">
                <div :class="{'w-full px-8 pb-2': !showEditor, 'px-8 pb-2': showEditor}" :style="!showEditor ? 'max-width: 800px' : ''" ref="previewContent" v-html="renderedContent"></div>
              </div>
            </div>
            
            <!-- TOC Sidebar (only in view mode, no editor) -->
            <div v-if="toc.length > 0 && mode === 'view' && !showEditor" 
                 class="w-56 shrink-0 overflow-y-auto p-3 hidden lg:block border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <h3 class="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                <i class="fa-solid fa-list mr-1"></i> 目錄
              </h3>
              <nav class="space-y-1">
                <a v-for="item in toc" :key="item.id"
                   @click.prevent="scrollToHeading(item.id)"
                   class="block text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer truncate transition-colors"
                   :style="{ paddingLeft: ((item.level - 1) * 12) + 'px' }">
                  {{ item.text }}
                </a>
              </nav>
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
      @close="showSettingsModal = false"
      @set-theme="setTheme"
      @logout="logout"
      @open-about="showAboutModal = true"
    />
    
    <AboutModal :show="showAboutModal" :app-version="appVersion" @close="showAboutModal = false" />
    
    <UserProfileModal 
      :show="showUserProfileModal" 
      :user="currentUser"
      @close="showUserProfileModal = false"
      @updated="handleUserProfileUpdate"
    />
    
    <CreateBookModal 
      :show="showCreateBookModal"
      @close="showCreateBookModal = false"
      @create="handleCreateBook"
    />
    
    <RevisionsModal 
      :show="showRevisionsModal"
      :note-id="note?.id"
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
      @update:newUserPermission="newUserPermission = $event"
      @search-users="(q) => { userSearchQuery = q; searchUsers(); }"
      @add-user-permission="addUserPermission"
      @remove-user-permission="removeUserPermission"
      @update-user-permission="updateUserPermissionLevel"
    />

    <ImageLightbox 
      :image="lightboxImage"
      :zoom="lightboxZoom"
      @close="closeLightbox"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @wheel="handleLightboxWheel"
    />
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

.editor-container { height: 100%; }
.editor-container .cm-editor { height: 100%; }
.editor-container .cm-scroller { overflow: auto; }
.editor-container .cm-content { font-family: 'Fira Code', monospace; font-size: 16px; line-height: 1.6; padding: 16px; }
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
.markdown-body h1 { font-size: 2em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; }
.markdown-body p { margin: 1em 0; }
.markdown-body ul, .markdown-body ol { margin: 1em 0; padding-left: 2em; }
.markdown-body code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
.markdown-body pre { margin: 1em 0; border-radius: 6px; overflow: auto; }
.markdown-body pre code { background: none; padding: 0; }
.markdown-body pre.hljs { padding: 1em; background: #0d1117; }
.markdown-body blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
.markdown-body table { border-collapse: collapse; margin: 1em 0; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid #ddd; padding: 0.5em 1em; }
.markdown-body a { color: #0366d6; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }

.dark .markdown-body code { background: #2d2d2d; }
.dark .markdown-body pre.hljs { background: #1e1e1e; }
.dark .markdown-body blockquote { border-color: #444; color: #aaa; }
.dark .markdown-body th, .dark .markdown-body td { border-color: #444; }
.dark .markdown-body a { color: #58a6ff; }
</style>
