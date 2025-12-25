<script setup>
/**
 * NoteView - 筆記編輯頁 (完整版)
 * 
 * 使用 CodeMirror 6 編輯器與 markdown-it 渲染器
 */
import { ref, computed, onMounted, onUnmounted, inject, watch, nextTick, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { useSocket } from '@/composables/useSocket'
import dayjs from 'dayjs'

// CodeMirror 6 imports
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'

// Markdown-it imports
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import markdownItIns from 'markdown-it-ins'
import markdownItTaskLists from 'markdown-it-task-lists'

// Highlight.js - 只載入常用語言
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

// 註冊語言
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
const loading = ref(true)
const saving = ref(false)
const content = ref('')

// User & permissions
const currentUser = ref(null)
const isOwner = ref(false)
const canEdit = ref(false)

// View mode
const viewMode = ref('edit') // 'edit', 'view', 'both'
const showSidebar = ref(false)

// Editor refs
const editorContainer = ref(null)
const previewContainer = ref(null)
const editorView = shallowRef(null)

// Markdown preview
const renderedContent = ref('')

// Socket.io for real-time collaboration
const { socket, joinNote, leaveNote, editNote, onNoteUpdated, offNoteUpdated, onUsersInNote, offUsersInNote, usersInNote } = useSocket()
const onlineUsers = ref([])
const showOnlineUsersPopup = ref(false)

// Initialize markdown-it with plugins
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

// Load note
const loadNote = async () => {
  loading.value = true
  try {
    // Load user info
    currentUser.value = await api.getMe().catch(() => null)
    
    // Load note
    const data = await api.getNote(route.params.id)
    note.value = data
    content.value = data.content || ''
    isOwner.value = data.isOwner || false
    canEdit.value = data.canEdit || false
    
    // Update page title
    const title = data.title || 'Untitled'
    document.title = `${title.substring(0, 20)} | NoteHubMD`
    
    // Render markdown
    renderMarkdown()
    
    // Initialize editor if can edit
    if (canEdit.value) {
      nextTick(() => initEditor())
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
    
    // Join socket room after loading
    if (note.value && canEdit.value) {
      const username = currentUser.value?.username || 'Guest'
      joinNote(note.value.id, username)
      
      // Listen for real-time updates
      onUsersInNote((users) => {
        onlineUsers.value = users
      })
      
      onNoteUpdated((newContent) => {
        if (newContent !== content.value && editorView.value) {
          content.value = newContent
          // Update editor without triggering change event
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

// Initialize CodeMirror 6 editor
const initEditor = () => {
  if (!editorContainer.value || editorView.value) return
  
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
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        content.value = update.state.doc.toString()
        debouncedSave()
        renderMarkdown()
        // Emit to socket for real-time sync
        if (note.value) {
          editNote(note.value.id, content.value)
        }
      }
    })
  ]
  
  if (isDark) {
    extensions.push(oneDark)
  }
  
  editorView.value = new EditorView({
    state: EditorState.create({
      doc: content.value,
      extensions
    }),
    parent: editorContainer.value
  })
}

// Render markdown preview
const renderMarkdown = () => {
  renderedContent.value = md.render(content.value)
}

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

// Toggle view mode
const setViewMode = (mode) => {
  viewMode.value = mode
}

// Go to share page
const openSharePage = () => {
  if (note.value?.shareId) {
    window.open('/s/' + note.value.shareId, '_blank')
  }
}

// Format date
const formatDate = (date) => {
  return dayjs(date).format('YYYY/MM/DD HH:mm')
}

// Cleanup
onMounted(() => {
  loadNote()
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
  if (editorView.value) {
    editorView.value.destroy()
    editorView.value = null
  }
  // Leave socket room
  if (note.value) {
    leaveNote(note.value.id)
    offNoteUpdated()
    offUsersInNote()
  }
})

// Watch route changes
watch(() => route.params.id, (newId, oldId) => {
  // Leave old room
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

// Watch dark mode changes
watch(() => document.documentElement.classList.contains('dark'), (isDark) => {
  if (editorView.value) {
    // Recreate editor with new theme
    const doc = editorView.value.state.doc.toString()
    editorView.value.destroy()
    editorView.value = null
    content.value = doc
    nextTick(() => initEditor())
  }
})
</script>

<template>
  <div class="flex h-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text">
    <!-- Sidebar Strip -->
    <div 
      @click="showSidebar = true"
      class="w-12 bg-gray-200 dark:bg-gray-900 flex flex-col items-center py-3 border-r border-gray-300 dark:border-gray-800 shrink-0 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-800 transition"
      title="展開選單"
    >
      <router-link to="/" class="flex items-center justify-center mb-4" @click.stop>
        <img src="@/assets/images/logo.png" alt="NoteHubMD" class="w-8 h-8">
      </router-link>
      <div class="flex-1"></div>
      <div 
        class="w-8 h-8 rounded-full flex items-center justify-center text-white overflow-hidden"
        :class="currentUser ? 'bg-blue-600' : 'bg-gray-500'"
      >
        <img v-if="currentUser?.avatar" :src="currentUser.avatar" class="w-full h-full object-cover" alt="">
        <span v-else>{{ currentUser?.username?.charAt(0).toUpperCase() || '?' }}</span>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Loading -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
      </div>

      <!-- Note Content -->
      <template v-else-if="note">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-2 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-surface shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <h1 class="text-lg font-semibold truncate">{{ note.title || 'Untitled' }}</h1>
            <span v-if="saving" class="text-sm text-gray-500">
              <i class="fa-solid fa-spinner fa-spin mr-1"></i>儲存中...
            </span>
            <span v-else class="text-sm text-gray-500">
              <i class="fa-solid fa-check text-green-500 mr-1"></i>已儲存
            </span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Online Users -->
            <div v-if="onlineUsers.length > 0" class="flex items-center relative">
              <div class="flex -space-x-2">
                <div 
                  v-for="(user, index) in onlineUsers.slice(0, 3)" 
                  :key="user.username"
                  class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs overflow-hidden border-2 border-white dark:border-gray-800 bg-blue-600"
                  :title="user.username"
                >
                  <img v-if="user.avatar" :src="user.avatar" class="w-full h-full object-cover" alt="">
                  <span v-else>{{ user.username?.charAt(0).toUpperCase() || '?' }}</span>
                </div>
                <div 
                  v-if="onlineUsers.length > 3"
                  class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs bg-gray-500 border-2 border-white dark:border-gray-800 cursor-pointer"
                  @click="showOnlineUsersPopup = !showOnlineUsersPopup"
                >
                  +{{ onlineUsers.length - 3 }}
                </div>
              </div>
              <span class="ml-2 text-xs text-gray-500">{{ onlineUsers.length }} 人在線</span>
              
              <!-- Users Popup -->
              <div 
                v-if="showOnlineUsersPopup"
                class="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 z-50 min-w-48"
              >
                <div class="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">線上使用者</div>
                <div class="space-y-2">
                  <div v-for="user in onlineUsers" :key="user.username" class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs overflow-hidden bg-blue-600">
                      <img v-if="user.avatar" :src="user.avatar" class="w-full h-full object-cover" alt="">
                      <span v-else>{{ user.username?.charAt(0).toUpperCase() || '?' }}</span>
                    </div>
                    <span class="text-sm text-gray-700 dark:text-gray-300">{{ user.username }}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- View Mode Toggle -->
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button 
                @click="setViewMode('edit')"
                :class="viewMode === 'edit' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400'"
                class="px-2 py-1 rounded text-sm transition cursor-pointer"
                title="編輯"
              >
                <i class="fa-solid fa-pen"></i>
              </button>
              <button 
                @click="setViewMode('both')"
                :class="viewMode === 'both' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400'"
                class="px-2 py-1 rounded text-sm transition cursor-pointer"
                title="雙欄"
              >
                <i class="fa-solid fa-columns"></i>
              </button>
              <button 
                @click="setViewMode('view')"
                :class="viewMode === 'view' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400'"
                class="px-2 py-1 rounded text-sm transition cursor-pointer"
                title="預覽"
              >
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
            
            <!-- Share Button -->
            <button 
              v-if="note.shareId"
              @click="openSharePage"
              class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition cursor-pointer"
            >
              <i class="fa-solid fa-share-nodes mr-1"></i>分享
            </button>
          </div>
        </div>

        <!-- Editor / Preview Area -->
        <div class="flex-1 flex overflow-hidden">
          <!-- Editor -->
          <div 
            v-show="viewMode === 'edit' || viewMode === 'both'"
            class="flex-1 flex flex-col overflow-hidden"
            :class="viewMode === 'both' ? 'border-r border-gray-300 dark:border-gray-700' : ''"
          >
            <div v-if="canEdit" ref="editorContainer" class="flex-1 overflow-auto editor-container"></div>
            <div v-else class="flex-1 flex items-center justify-center text-gray-500">
              <i class="fa-solid fa-lock mr-2"></i>您沒有編輯權限
            </div>
          </div>

          <!-- Preview -->
          <div 
            v-show="viewMode === 'view' || viewMode === 'both'"
            ref="previewContainer"
            class="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900"
          >
            <div 
              class="prose dark:prose-invert max-w-none markdown-body"
              v-html="renderedContent"
            ></div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-4 py-2 border-t border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-surface text-xs text-gray-500 shrink-0">
          <div class="flex items-center gap-4">
            <span><i class="fa-solid fa-user mr-1"></i>{{ note.owner?.username }}</span>
            <span><i class="fa-solid fa-clock mr-1"></i>{{ formatDate(note.updatedAt) }}</span>
            <span><i class="fa-solid fa-text-width mr-1"></i>{{ content.length }} 字元</span>
          </div>
          <div v-if="note.book" class="flex items-center">
            <router-link :to="'/b/' + note.book.id" class="text-blue-500 hover:underline">
              <i class="fa-solid fa-book mr-1"></i>{{ note.book.title }}
            </router-link>
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
  </div>
</template>

<style>
/* CodeMirror 6 container */
.editor-container {
  height: 100%;
}

.editor-container .cm-editor {
  height: 100%;
}

.editor-container .cm-scroller {
  overflow: auto;
}

.editor-container .cm-content {
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.6;
  padding: 16px;
}

.editor-container .cm-line {
  padding: 0 4px;
}

/* Light theme adjustments */
.editor-container .cm-gutters {
  background-color: #f8f9fa;
  border-right: 1px solid #e5e5e5;
}

/* Markdown preview styles */
.markdown-body {
  font-size: 16px;
  line-height: 1.6;
}

.markdown-body h1 { font-size: 2em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.5em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
.markdown-body h3 { font-size: 1.25em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; }
.markdown-body h4 { font-size: 1em; margin-top: 1em; margin-bottom: 0.5em; font-weight: bold; }
.markdown-body p { margin: 1em 0; }
.markdown-body ul, .markdown-body ol { margin: 1em 0; padding-left: 2em; }
.markdown-body li { margin: 0.25em 0; }
.markdown-body code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; font-family: 'Fira Code', monospace; }
.markdown-body pre { margin: 1em 0; border-radius: 6px; overflow: auto; }
.markdown-body pre code { background: none; padding: 0; }
.markdown-body pre.hljs { padding: 1em; background: #0d1117; }
.markdown-body blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
.markdown-body table { border-collapse: collapse; margin: 1em 0; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid #ddd; padding: 0.5em 1em; }
.markdown-body th { background: #f5f5f5; font-weight: bold; }
.markdown-body img { max-width: 100%; border-radius: 4px; }
.markdown-body a { color: #0366d6; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body hr { border: none; border-top: 1px solid #eee; margin: 2em 0; }
.markdown-body mark { background-color: #fff3b0; padding: 0.1em 0.2em; }
.markdown-body ins { text-decoration: underline; }
.markdown-body sub, .markdown-body sup { font-size: 0.8em; }

/* Task list styles */
.markdown-body .task-list-item { list-style: none; }
.markdown-body .task-list-item input[type="checkbox"] { margin-right: 0.5em; }

/* Dark mode */
.dark .markdown-body code { background: #2d2d2d; }
.dark .markdown-body pre.hljs { background: #1e1e1e; }
.dark .markdown-body blockquote { border-color: #444; color: #aaa; }
.dark .markdown-body th, .dark .markdown-body td { border-color: #444; }
.dark .markdown-body th { background: #2d2d2d; }
.dark .markdown-body h1, .dark .markdown-body h2 { border-color: #444; }
.dark .markdown-body a { color: #58a6ff; }
.dark .markdown-body mark { background-color: #634d00; }
</style>
