<script setup>
/**
 * NoteShareView - 筆記分享頁 (唯讀檢視)
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, shallowRef, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { copyToClipboard } from '@/utils/clipboard'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

// Reveal.js
import Reveal from 'reveal.js'
import 'reveal.js/dist/reveal.css'
import 'reveal.js/dist/theme/black.css'

// Markdown-it imports
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import markdownItIns from 'markdown-it-ins'
import markdownItTaskLists from 'markdown-it-task-lists'
import markdownItContainer from 'markdown-it-container'
import markdownItImsize from 'markdown-it-imsize/dist/markdown-it-imsize.min.js'
// KaTeX - loaded dynamically when math content is detected
// import markdownItKatex from 'markdown-it-katex'
// import 'katex/dist/katex.min.css'
import { tab as markdownItTab } from '@mdit/plugin-tab'
import { imgLazyload } from '@mdit/plugin-img-lazyload'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItAbbr from 'markdown-it-abbr'

// Dynamic loaders for bundle optimization
import { loadMermaid, loadKatexPlugin, contentHasMath } from '@/composables/useDynamicLoaders'

// Excalidraw for whiteboard notes
import ExcalidrawWrapper from '@/components/whiteboard/ExcalidrawWrapper.vue'

// DrawioEmbedWrapper for flowchart notes
import DrawioEmbedWrapper from '@/components/flowchart/DrawioEmbedWrapper.vue'

// Comment Section
import CommentSection from '@/components/common/CommentSection.vue'
import NoteReactions from '@/components/common/NoteReactions.vue'
import ImageLightbox from '@/components/common/ImageLightbox.vue'
// AI Assistant - dynamically loaded only when AI is enabled
const AiAssistantButton = defineAsyncComponent(() => 
  import('@/components/common/AiAssistantButton.vue')
)

// Note: mermaid and KaTeX are loaded dynamically via useDynamicLoaders

// Highlight.js
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import 'highlight.js/styles/github-dark.css'

// Register languages
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)

// Setup dayjs
dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const route = useRoute()
const router = useRouter()

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

// Note data
const loading = ref(true)
const error = ref('')
const title = ref('')
const content = ref('')
const noteId = ref('')
const noteOwner = ref(null)
const lastEditor = ref(null)
const lastEditedAt = ref(null)
const noteCreatedAt = ref(null)
const canEdit = ref(false)
const commentsEnabled = ref(true)
const featureConfig = ref({ comments: true, noteReactions: true })
const currentUser = ref(null)

// AI Assistant - check enabled status before loading component
const aiEnabled = ref(false)
const hideAiFloatingButton = ref(localStorage.getItem('NoteHubMD-hideAiFloatingButton') === 'true')

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

// Book data
const book = ref(null)
const bookNotes = ref([])
const showBookToc = ref(true)

// TOC
const toc = ref([])
const activeTocId = ref('')

// Theme
const theme = ref(localStorage.getItem('NoteHubMD-theme') || 'dark')

// Lightbox
const lightboxImage = ref(null)

// Refs
const previewContainer = ref(null)
const previewContent = ref(null)

// Slide mode
const showSlide = ref(false)
const revealInstance = shallowRef(null)

// Note type (markdown, excalidraw, or drawio)
const noteType = ref('markdown')
const excalidrawData = ref({ elements: [], appState: {}, files: {} })
const drawioData = ref({ xml: null })

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

// Initialize markdown-it
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
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
  // KaTeX is loaded dynamically in renderContent when math content is detected
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

// Computed
const relativeLastEditedTime = computed(() => {
  return lastEditedAt.value ? dayjs(lastEditedAt.value).fromNow() : ''
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
  if (!lastEditedAt.value) return null
  return dayjs(lastEditedAt.value).format('YYYY年MM月DD日 HH:mm')
})

// Check if the note has been edited (different from created)
const isEdited = computed(() => {
  if (!noteCreatedAt.value || !lastEditedAt.value) return false
  // Consider edited if difference > 1 minute
  return Math.abs(dayjs(lastEditedAt.value).diff(dayjs(noteCreatedAt.value), 'minute')) > 1
})

const prevNote = computed(() => {
  if (!book.value || bookNotes.value.length === 0) return null
  const idx = bookNotes.value.findIndex(n => n.id === noteId.value)
  return idx > 0 ? bookNotes.value[idx - 1] : null
})

const nextNote = computed(() => {
  if (!book.value || bookNotes.value.length === 0) return null
  const idx = bookNotes.value.findIndex(n => n.id === noteId.value)
  return idx >= 0 && idx < bookNotes.value.length - 1 ? bookNotes.value[idx + 1] : null
})

// Get share link for a note
const getNoteShareLink = (note) => {
  return note.shareId ? `/s/${note.shareId}` : `/n/${note.id}`
}

// Toggle theme
const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('NoteHubMD-theme', theme.value)
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
}

// Load note
const loadNote = async () => {
  loading.value = true
  error.value = ''
  try {
    const shareId = route.params.shareId
    const data = await api.getSharedNote(shareId)
    
    title.value = data.title || 'Untitled'
    content.value = data.content || ''
    noteId.value = data.id
    noteOwner.value = data.owner
    lastEditor.value = data.lastEditor
    lastEditedAt.value = data.lastEditedAt || data.lastContentEditedAt
    noteCreatedAt.value = data.createdAt || null
    canEdit.value = data.canEdit || false
    commentsEnabled.value = data.commentsDisabled !== true
    
    // Load global feature config
    try {
      featureConfig.value = await api.getFeatureConfig()
    } catch (e) {
      // Keep defaults if fetch fails
    }
    
    // Detect note type (markdown or excalidraw)
    noteType.value = data.noteType || 'markdown'
    
    // Parse excalidraw data if whiteboard type
    if (noteType.value === 'excalidraw') {
      try {
        // Excalidraw data can be stored in diagramData (from WhiteboardView) or content
        const rawData = data.diagramData || content.value || '{}'
        excalidrawData.value = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
        // Ensure required properties exist
        if (!excalidrawData.value.elements) excalidrawData.value.elements = []
        if (!excalidrawData.value.appState) excalidrawData.value.appState = {}
        if (!excalidrawData.value.files) excalidrawData.value.files = {}
      } catch (e) {
        console.warn('Failed to parse excalidraw data:', e)
        excalidrawData.value = { elements: [], appState: {}, files: {} }
      }
    }
    
    // Parse drawio data if flowchart type
    if (noteType.value === 'drawio') {
      try {
        const rawData = data.diagramData || {}
        drawioData.value = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
        if (!drawioData.value.xml) drawioData.value.xml = null
      } catch (e) {
        console.warn('Failed to parse drawio data:', e)
        drawioData.value = { xml: null }
      }
    }
    
    // Handle API response: Book (capitalized) with Notes (capitalized)
    const bookData = data.book || data.Book
    if (bookData) {
      book.value = bookData
      // Handle notes array (could be 'notes' or 'Notes')
      const notesArray = bookData.notes || bookData.Notes || []
      // Sort by order
      bookNotes.value = [...notesArray].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    
    document.title = `${title.value.substring(0, 30)} | NoteHubMD`
    
  } catch (e) {
    console.error('Failed to load note:', e)
    error.value = e.message || '無法載入筆記'
  } finally {
    loading.value = false
    // Render content after DOM update (only for markdown)
    nextTick(() => renderContent())
    
    // Check AI enabled status (non-blocking)
    checkAiEnabled()
  }
}

// Render markdown content
const renderContent = async () => {
  if (!previewContent.value) return
  
  // Conditionally load KaTeX if math content is detected
  if (contentHasMath(content.value)) {
    await loadKatexPlugin(md)
  }
  
  const rendered = md.render(content.value)
  previewContent.value.innerHTML = rendered
  
  // Extract TOC
  extractToc()
  
  // Add image click handlers
  previewContent.value.querySelectorAll('img').forEach(img => {
    img.style.cursor = 'zoom-in'
    img.addEventListener('click', () => {
      lightboxImage.value = img.src
    })
  })
  
  // Render mermaid diagrams (dynamically loaded)
  const mermaidDivs = previewContent.value.querySelectorAll('.mermaid')
  if (mermaidDivs.length > 0) {
    try {
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
  
  // Initialize TOC highlight (default to first heading)
  handlePreviewScroll()
}

// Extract TOC from headings
const extractToc = () => {
  if (!previewContent.value) return
  
  const headings = previewContent.value.querySelectorAll('h1, h2, h3')
  const items = []
  
  headings.forEach((heading, index) => {
    const id = heading.id || `heading-${index}`
    if (!heading.id) heading.id = id
    
    items.push({
      id,
      text: heading.textContent,
      level: parseInt(heading.tagName.charAt(1))
    })
  })
  
  toc.value = items
}

// Scroll to top/bottom
const scrollToTop = () => {
  if (previewContainer.value) {
    previewContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

const scrollToBottom = () => {
  if (previewContainer.value) {
    previewContainer.value.scrollTo({ top: previewContainer.value.scrollHeight, behavior: 'smooth' })
  }
}

// Scroll to heading
const scrollToHeading = (id) => {
  const el = document.getElementById(id)
  if (el && previewContainer.value) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// Handle scroll for active TOC
const handlePreviewScroll = () => {
  if (!previewContent.value || toc.value.length === 0) return
  
  const headings = previewContent.value.querySelectorAll('h1, h2, h3')
  let activeId = ''
  
  headings.forEach(heading => {
    const rect = heading.getBoundingClientRect()
    if (rect.top < 150) {
      activeId = heading.id
    }
  })
  
  // If no heading is above the threshold (page at top), default to first heading
  if (!activeId && headings.length > 0) {
    activeId = headings[0].id
  }
  
  activeTocId.value = activeId
}

// Close lightbox
const closeLightbox = () => {
  lightboxImage.value = null
}

// Toggle book TOC
const toggleBookToc = () => {
  showBookToc.value = !showBookToc.value
}

// Toggle slide mode
const toggleSlide = async () => {
  if (showSlide.value) {
    // Close slide
    showSlide.value = false
    if (revealInstance.value) {
      try {
        revealInstance.value.destroy()
        revealInstance.value = null
      } catch (e) {
        console.warn('Failed to destroy Reveal instance', e)
      }
    }
    document.body.style.overflow = ''
    
    // Remove URL parameter
    const url = new URL(window.location)
    url.searchParams.delete('view')
    window.history.replaceState({}, '', url)
  } else {
    // Open slide
    showSlide.value = true
    document.body.style.overflow = 'hidden'
    
    // Add URL parameter
    const url = new URL(window.location)
    url.searchParams.set('view', 'slide')
    window.history.replaceState({}, '', url)
    
    await nextTick()
    
    const slidesContainer = document.querySelector('.reveal .slides')
    if (!slidesContainer) return
    
    // Split content by --- 
    const sections = content.value.split(/\n---\n/)
    let slidesHtml = ''
    sections.forEach(section => {
      const rendered = md.render(section)
      slidesHtml += `<section>${rendered}</section>`
    })
    slidesContainer.innerHTML = slidesHtml
    
    // Initialize Reveal
    revealInstance.value = new Reveal(document.querySelector('.reveal'), {
      embedded: true,
      hash: false,
      history: false,
      plugins: [],
      slideNumber: true
    })
    
    await revealInstance.value.initialize()
  }
}

// Handle ESC to close slide
const handleEscKey = (e) => {
  if (e.key === 'Escape' && showSlide.value) {
    toggleSlide()
  }
}

onMounted(async () => {
  // Load current user for comments
  try {
    currentUser.value = await api.getMe()
  } catch (e) {
    currentUser.value = null
  }
  
  loadNote()
  document.addEventListener('keyup', handleEscKey)
  
  // Check URL for slide mode
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('view') === 'slide') {
    // Delay to ensure content is loaded
    setTimeout(() => toggleSlide(), 500)
  }
})

onUnmounted(() => {
  document.removeEventListener('keyup', handleEscKey)
  if (revealInstance.value) {
    revealInstance.value.destroy()
  }
})

// Watch route changes
watch(() => route.params.shareId, () => {
  loadNote()
})
</script>

<template>
  <div class="flex flex-col h-full bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="text-center">
        <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500 mb-4"></i>
        <p class="text-gray-500 dark:text-gray-400">載入中...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex items-center justify-center h-full">
      <div class="text-center max-w-md mx-auto p-8">
        <i class="fa-solid fa-exclamation-circle text-6xl text-red-500 mb-4"></i>
        <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-2">無法載入</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
        <router-link to="/" class="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
          <i class="fa-solid fa-home mr-2"></i>返回首頁
        </router-link>
      </div>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Header (hidden in slide mode) -->
      <div v-show="!showSlide" class="bg-gray-200 dark:bg-gray-900 px-4 py-3 flex items-center shadow-md z-10 shrink-0">
        <div class="flex-1 flex items-center space-x-3">
          <router-link to="/" class="hover:text-blue-400 transition">
            <img src="@/assets/images/logo.png" alt="NoteHubMD" class="w-8 h-8">
          </router-link>

          <span class="text-gray-600">/</span>
          <!-- Book Title (if note is in a book) -->
          <template v-if="book">
            <a :href="'/v/' + (book.shareId || book.shareAlias || book.id)" class="text-sm bg-gray-300 dark:bg-gray-800 px-3 py-1 rounded truncate max-w-[200px] hover:text-blue-400 transition">
              <i class="fa-solid fa-book mr-2"></i>{{ book.title }}
            </a>
            <span class="text-gray-600">/</span>
          </template>
          <span class="text-sm bg-gray-300 dark:bg-gray-800 px-3 py-1 rounded truncate max-w-md">
            <i :class="noteType === 'excalidraw' ? 'fa-solid fa-chalkboard mr-2 text-purple-500' : (noteType === 'drawio' ? 'fa-solid fa-project-diagram mr-2 text-teal-500' : 'fa-solid fa-note-sticky mr-2')"></i>{{ title }}
          </span>
        </div>
        <div class="flex items-center space-x-3">
          <!-- Theme Toggle -->
          <button 
            @click="toggleTheme" 
            class="px-2 py-1 text-xs border border-gray-500 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-400 hover:text-white dark:hover:bg-gray-700 transition cursor-pointer"
            :title="theme === 'dark' ? '切換為淺色模式' : '切換為深色模式'"
          >
            <i :class="theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'"></i>
          </button>
          <!-- Slide Mode Button (only for markdown) -->
          <button 
            v-if="noteType === 'markdown'"
            @click="toggleSlide"
            class="px-2 py-1 text-xs border border-gray-500 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-400 hover:text-white dark:hover:bg-gray-700 transition cursor-pointer"
            title="簡報模式"
          >
            <i class="fa-solid fa-display mr-1"></i>簡報
          </button>
          <!-- Edit Button -->
          <a 
            :href="'/n/' + noteId" 
            class="px-2 py-1 text-xs border border-blue-500 text-blue-400 rounded hover:bg-blue-500 hover:text-white transition"
          >
            <i class="fa-solid fa-pen-to-square mr-1"></i>編輯
          </a>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Book TOC Sidebar -->
        <div 
          v-if="book && bookNotes.length > 0" 
          v-show="showBookToc" 
          class="w-60 shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
        >
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
            <h3 class="font-bold text-gray-700 dark:text-gray-200 truncate text-sm" :title="book.title">
              <i class="fa-solid fa-book mr-2"></i>{{ book.title }}
            </h3>
            <button @click="toggleBookToc" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition cursor-pointer">
              <i class="fa-solid fa-angles-left"></i>
            </button>
          </div>
          <div class="overflow-y-auto flex-1 p-2 space-y-1">
            <a 
              v-for="note in bookNotes" 
              :key="note.id" 
              :href="getNoteShareLink(note)"
              class="block px-3 py-2 rounded-md text-sm transition-colors truncate"
              :class="note.id === noteId ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 font-medium shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
              :title="note.title"
            >
              {{ note.title }}
            </a>
          </div>
        </div>

        <!-- Expand Book TOC Button -->
        <div v-if="book && bookNotes.length > 0 && !showBookToc" class="absolute left-0 top-50 z-30">
          <button 
            @click="toggleBookToc" 
            class="bg-gray-100 dark:bg-gray-700 hover:bg-white dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 border-l-0 rounded-r-md shadow-md py-3 px-1.5 cursor-pointer flex flex-col items-center gap-1"
            title="顯示書本目錄">
            <i class="fa-solid fa-book-open text-xs"></i>
            <span class="text-xs" style="writing-mode: vertical-rl;">書本目錄</span>
          </button>
        </div>

        <!-- Preview Content -->
        <div class="flex-1" :class="(noteType === 'excalidraw' || noteType === 'drawio') ? 'overflow-hidden' : 'overflow-auto'" ref="previewContainer" @scroll="handlePreviewScroll">
          <div class="flex flex-col" :class="(noteType === 'excalidraw' || noteType === 'drawio') ? 'h-full' : 'min-h-full'">
            <!-- Top Navigation -->
            <div v-if="book && bookNotes.length > 1" class="flex justify-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
              <div class="w-full px-2 py-0" style="max-width: 800px;">
                <div class="flex justify-between items-center text-sm">
                  <a v-if="prevNote" :href="getNoteShareLink(prevNote)" class="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition py-2">
                    <i class="fa-solid fa-chevron-left mr-2"></i>
                    <span class="truncate max-w-[250px] font-medium">上一篇：{{ prevNote.title || 'Untitled' }}</span>
                  </a>
                  <div v-else></div>
                  <a v-if="nextNote" :href="getNoteShareLink(nextNote)" class="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition py-2 text-right">
                    <span class="truncate max-w-[250px] font-medium">下一篇：{{ nextNote.title || 'Untitled' }}</span>
                    <i class="fa-solid fa-chevron-right ml-2"></i>
                  </a>
                  <div v-else></div>
                </div>
              </div>
            </div>

            <!-- Info Bar -->
            <div class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 text-xs text-gray-500 dark:text-gray-400 flex justify-center">
              <div class="w-full px-8" style="max-width: 900px">
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

            <!-- Markdown Content -->
            <div v-if="noteType === 'markdown'" class="markdown-body dark:text-gray-300 flex justify-center flex-grow">
              <div class="w-full px-4 md:px-8 py-4" style="max-width: 900px" ref="previewContent"></div>
            </div>

            <!-- Excalidraw Whiteboard (Read-only) -->
            <div v-else-if="noteType === 'excalidraw'" class="flex-1 flex flex-col relative">
              <ExcalidrawWrapper
                :initial-data="excalidrawData"
                :theme="theme"
                :read-only="true"
              />
            </div>

            <!-- Drawio Flowchart (Read-only) -->
            <div v-else-if="noteType === 'drawio'" class="flex-1 flex flex-col relative">
              <DrawioEmbedWrapper
                :initial-data="drawioData"
                :theme="theme === 'dark' ? 'dark' : 'kennedy'"
                :read-only="true"
              />
            </div>

            <!-- Bottom Navigation -->
            <div v-if="book && bookNotes.length > 1 && noteType === 'markdown'" class="flex justify-center border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 mt-auto">
              <div class="w-full px-4 py-1" style="max-width: 900px">
                <div class="flex justify-between items-center text-sm">
                  <a v-if="prevNote" :href="getNoteShareLink(prevNote)" class="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition py-2">
                    <i class="fa-solid fa-chevron-left mr-2"></i>
                    <span class="truncate max-w-[250px] font-medium">上一篇：{{ prevNote.title || 'Untitled' }}</span>
                  </a>
                  <div v-else></div>
                  <a v-if="nextNote" :href="getNoteShareLink(nextNote)" class="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition py-2 text-right">
                    <span class="truncate max-w-[250px] font-medium">下一篇：{{ nextNote.title || 'Untitled' }}</span>
                    <i class="fa-solid fa-chevron-right ml-2"></i>
                  </a>
                  <div v-else></div>
                </div>
              </div>
            </div>

            <!-- Note Reactions (emoji feedback) -->
            <div v-if="noteType === 'markdown' && noteId && featureConfig.noteReactions" 
                 class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-center">
              <div class="w-full" style="max-width: 900px">
                <NoteReactions 
                  :noteId="noteId"
                  :currentUser="currentUser"
                />
              </div>
            </div>

            <!-- Comments Section (only for markdown notes if enabled) -->
            <div v-if="noteType === 'markdown' && commentsEnabled && featureConfig.comments && noteId" 
                 class="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-center">
              <div class="w-full px-4 md:px-8 py-6" style="max-width: 900px">
                <CommentSection 
                  :noteId="noteId"
                  :currentUser="currentUser"
                  :isOwner="false"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- TOC Sidebar (only for markdown) -->
        <div v-if="noteType === 'markdown' && toc.length > 0" class="w-56 shrink-0 overflow-y-auto p-3 hidden lg:block border-l border-gray-200 dark:border-gray-700">
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
            <a 
              v-for="item in toc" 
              :key="item.id" 
              :href="'#' + item.id"
              @click.prevent="scrollToHeading(item.id)"
              class="block py-0.5 text-sm transition truncate border-l-2 cursor-pointer"
              :class="{
                'pl-2': item.level === 1, 
                'pl-4': item.level === 2, 
                'pl-7': item.level === 3,
                'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 font-black': activeTocId === item.id,
                'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border-transparent': activeTocId !== item.id
              }"
              :title="item.text"
            >
              {{ item.text }}
            </a>
          </nav>
        </div>
      </div>
    </template>

    <!-- Lightbox -->
    <ImageLightbox 
      :image="lightboxImage" 
      @close="closeLightbox"
    />

    <!-- Reveal.js Container -->
    <div v-show="showSlide" class="reveal fixed inset-0 z-50 bg-black">
      <div class="slides"></div>
      <button @click="toggleSlide" class="fixed top-4 right-4 z-[60] text-white/50 hover:text-white text-3xl transition cursor-pointer">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <!-- AI Assistant Button (shown when floating button is not hidden) -->
    <AiAssistantButton 
      v-if="aiEnabled && !hideAiFloatingButton"
      :note-content="content"
      :note-title="title"
    />
  </div>
</template>

<style>
/* Markdown styles - same as NoteView */
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
.markdown-body pre.hljs { padding: 1em; }
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

/* Mermaid */
.mermaid {
    display: block;
    text-align: center;
    background-color: transparent;
    padding: 10px;
    width: 100%;
    overflow-x: auto;
}
.mermaid svg {
    max-width: 100%;
    height: auto;
    display: inline-block;
}

/* Alerts */
.alert {
    padding: 15px;
    margin-bottom: 20px;
    border: 1px solid transparent;
    border-radius: 4px;
}
.alert-success {
    color: #3c763d;
    background-color: #dff0d8;
    border-color: #d6e9c6;
}
.alert-info {
    color: #31708f;
    background-color: #d9edf7;
    border-color: #bce8f1;
}
.alert-warning {
    color: #8a6d3b;
    background-color: #fcf8e3;
    border-color: #faebcc;
}
.alert-danger {
    color: #a94442;
    background-color: #f2dede;
    border-color: #ebccd1;
}

/* Dark mode alerts */
.dark .alert-success {
    color: #dff0d8;
    background-color: #2e4a33;
    border-color: #3c5e42;
}
.dark .alert-info {
    color: #d9edf7;
    background-color: #244b5e;
    border-color: #2a5d75;
}
.dark .alert-warning {
    color: #fcf8e3;
    background-color: #5c4f28;
    border-color: #75612b;
}
.dark .alert-danger {
    color: #f2dede;
    background-color: #6a3535;
    border-color: #853e3e;
}

/* Spoiler */
details {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5em 0.5em 0;
    margin-bottom: 1em;
}
summary {
    font-weight: bold;
    margin: -0.5em -0.5em 0;
    padding: 0.5em;
    cursor: pointer;
}
details[open] {
    padding: 0.5em;
}
details[open] summary {
    border-bottom: 1px solid #ddd;
    margin-bottom: 0.5em;
}
.dark details {
    border-color: #444;
}
.dark details[open] summary {
    border-bottom-color: #444;
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

.dark .markdown-body code { background: #2d2d2d; }
.dark .markdown-body pre.hljs { background: #1e1e1e; }
.dark .markdown-body blockquote { border-color: #444; color: #aaa; }
.dark .markdown-body th, .dark .markdown-body td { border-color: #444; }
.dark .markdown-body h1, .dark .markdown-body h2 { border-color: #444; }
.dark .markdown-body a { color: #58a6ff; }

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

/* Excalidraw wrapper fix - Veaury creates a div with 'all: unset' that breaks height */
.excalidraw-wrapper {
    width: 100%;
    height: 100%;
    min-height: 600px;
    display: flex !important;
    flex-direction: column !important;
}

/* Fix Veaury React wrapper height issue using flexbox, but exclude our loading/error states */
.excalidraw-wrapper > div:not(.excalidraw-loading):not(.excalidraw-error) {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    height: auto !important;
}

/* Ensure grandchildren also expand (for Veaury internal div), but protect spinner */
.excalidraw-wrapper > div:not(.excalidraw-loading):not(.excalidraw-error) > div {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    height: auto !important;
}

.excalidraw-wrapper :deep(.excalidraw) {
    width: 100%;
    height: 100%;
    flex: 1;
}

.excalidraw-wrapper :deep(.excalidraw-container) {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}
</style>
