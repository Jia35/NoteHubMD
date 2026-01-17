<script setup>
/**
 * FlowchartView - Flow diagram editing page using Draw.io embed
 * Similar structure to WhiteboardView.vue but for flowchart type notes
 */
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import DrawioEmbedWrapper from '@/components/flowchart/DrawioEmbedWrapper.vue'
import InfoModal from '@/components/common/InfoModal.vue'
import SidebarNav from '@/components/common/SidebarNav.vue'
import { SettingsModal, AboutModal, CreateBookModal } from '@/components'
import { useSocket } from '@/composables/useSocket'
import { useYjsDrawio } from '@/composables/useYjsDrawio'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const route = useRoute()
const router = useRouter()

// Socket
const { joinNote, leaveNote, onUsersInNote, offUsersInNote, onPermissionChanged, offPermissionChanged } = useSocket()

// Inject global functions
const theme = inject('theme', ref('dark'))
const showAlert = inject('showAlert')

// Flowchart theme preference (auto, light, dark)
const flowchartThemeSetting = ref(localStorage.getItem('NoteHubMD-flowchartTheme') || 'auto')

// Computed theme for flowchart (respects user preference)
// Draw.io uses 'kennedy' for light theme and 'dark' for dark theme
const computedFlowchartTheme = computed(() => {
  let effectiveTheme = theme.value
  if (flowchartThemeSetting.value !== 'auto') {
    effectiveTheme = flowchartThemeSetting.value
  }
  return effectiveTheme === 'dark' ? 'dark' : 'kennedy'
})

// State
const note = ref(null)
const loading = ref(true)
const saving = ref(false)
const lastSaved = ref(null)
const diagramData = ref({ xml: null })
const canEdit = ref(false)
const isOwner = ref(false)
const flowchartRef = ref(null)
const hasUnsavedChanges = ref(false)
const permission = ref('private')
const currentUser = ref(null)
const books = ref([])
const book = ref(null)

// Yjs collaboration
const yjsInstance = ref(null)
const isApplyingRemoteUpdate = ref(false)

// Title editing
const editingTitle = ref(false)
const titleInput = ref(null)
const localTitle = ref('')

// Right actions UI state
const onlineUsers = ref([])
const showOnlineUsersPopup = ref(false)
const showNoteMenu = ref(false)
const showNoteInfoModal = ref(false)
const noteInfoModalTab = ref('info')

// Sidebar state
const showSidebar = ref(false)
const pinnedItems = ref([])
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')
const appVersion = ref('')
const showSettingsModal = ref(false)
const settingsInitialTab = ref('')
const showCreateBookModal = ref(false)
const showAboutModal = ref(false)

// Permission options
const permissionOptions = [
  { value: 'public-edit', label: '可編輯' },
  { value: 'auth-edit', label: '可編輯(需登入)' },
  { value: 'public-view', label: '唯讀' },
  { value: 'auth-view', label: '唯讀(需登入)' },
  { value: 'private', label: '私人' },
  { value: 'inherit', label: '繼承書本' }
]

// Computed
const noteId = computed(() => route.params.id)

const lastSavedText = computed(() => {
  if (!lastSaved.value) return ''
  return dayjs(lastSaved.value).fromNow()
})

const noteInfoItem = computed(() => ({
  ...note.value,
  isOwner: isOwner.value,
  canEdit: canEdit.value
}))

const currentRoute = computed(() => '/n/' + route.params.id)
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return books.value.filter(b => b.isOwner)
  }
  return books.value.filter(b => b.isPublic)
})

// Load flowchart data
const loadFlowchart = async () => {
  loading.value = true
  try {
    const data = await api.getNote(noteId.value)
    console.log('loadFlowchart: got note data', data.noteType)
    
    // If not a flowchart, redirect to note view
    if (data.noteType !== 'drawio') {
      router.replace(`/n/${noteId.value}`)
      return
    }
    
    note.value = data
    localTitle.value = data.title || 'Untitled Flowchart'
    diagramData.value = data.diagramData || { xml: null }
    canEdit.value = data.canEdit
    isOwner.value = data.isOwner
    permission.value = data.permission || 'private'
    lastSaved.value = data.lastEditedAt || data.updatedAt
    
    // Fetch current user
    try {
      currentUser.value = await api.getMe()
    } catch (e) {
      currentUser.value = null
    }
    
    // Fetch books
    try {
      books.value = await api.getBooks()
    } catch (e) {
      books.value = []
    }
    
    // Fetch book data if note belongs to a book
    if (data.bookId) {
      try {
        book.value = await api.getBook(data.bookId)
      } catch (e) {
        book.value = data.book || null
      }
    } else {
      book.value = null
    }
    
    // Fetch app version
    try {
      const versionData = await api.getAppVersion()
      appVersion.value = versionData.version
    } catch (e) {
      appVersion.value = ''
    }
    
    // Join socket room
    const username = currentUser.value?.username || 'Guest'
    const name = currentUser.value?.name || null
    joinNote(data.id, username, name)
    onUsersInNote((users) => {
      onlineUsers.value = users
    })
    onPermissionChanged((data) => {
      permission.value = data.permission
      loadFlowchart()
    })
    
    // Initialize Yjs collaboration
    initYjsCollaboration(username)
  } catch (e) {
    console.error('Failed to load flowchart:', e)
    if (e.message?.includes('404') || e.message?.includes('not found')) {
      router.replace('/404')
    } else if (e.message?.includes('401')) {
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
    } else {
      showAlert?.('載入流程圖失敗', 'error')
    }
  } finally {
    loading.value = false
    hasUnsavedChanges.value = false
  }
}

// Initialize Yjs collaboration
const initYjsCollaboration = (username) => {
  if (!note.value) return
  
  // Cleanup previous instance if exists
  if (yjsInstance.value) {
    yjsInstance.value.destroy()
  }
  
  const yjs = useYjsDrawio(note.value.id, username)
  yjsInstance.value = yjs
  
  // Wait for sync then initialize data
  let checkSyncInterval = setInterval(() => {
    if (!yjsInstance.value) {
      clearInterval(checkSyncInterval)
      return
    }
    
    if (yjsInstance.value.synced.value) {
      clearInterval(checkSyncInterval)
      
      // If Yjs is empty, initialize with database data
      const yjsXml = yjsInstance.value.getXml()
      
      if (!yjsXml && diagramData.value?.xml) {
        // Initialize Yjs with database data
        yjsInstance.value.setXml(diagramData.value.xml)
      } else if (yjsXml) {
        // Use Yjs data if available
        diagramData.value = { xml: yjsXml }
        
        isApplyingRemoteUpdate.value = true
        flowchartRef.value?.updateScene?.({ xml: yjsXml })
        setTimeout(() => isApplyingRemoteUpdate.value = false, 500)
      }
    }
  }, 100)
  
  // Timeout after 10 seconds
  setTimeout(() => {
    if (yjsInstance.value && !yjsInstance.value.synced.value) {
      clearInterval(checkSyncInterval)
    }
  }, 10000)
  
  // Listen for remote changes
  yjs.onRemoteChange((xml) => {
    diagramData.value = { xml }
    
    isApplyingRemoteUpdate.value = true
    flowchartRef.value?.updateScene?.({ xml })
    setTimeout(() => isApplyingRemoteUpdate.value = false, 500)
  })
}

// Auto-save with debounce
let saveTimeout = null

const handleFlowchartChange = (data) => {
  if (!canEdit.value || !note.value) return
  
  // Skip if this is a remote update being applied
  if (isApplyingRemoteUpdate.value) return
  
  diagramData.value = data
  hasUnsavedChanges.value = true
  
  // Sync to Yjs for real-time collaboration
  if (yjsInstance.value && data.xml) {
    yjsInstance.value.setXml(data.xml)
  }
  
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  saveTimeout = setTimeout(() => {
    saveFlowchart()
  }, 2000)
}

const saveFlowchart = async (manual = false) => {
  if (saving.value || !note.value || !canEdit.value) return
  
  if (!manual && !hasUnsavedChanges.value) return

  saving.value = true
  try {
    await api.updateNote(note.value.id, { 
      diagramData: diagramData.value 
    })
    lastSaved.value = new Date()
    hasUnsavedChanges.value = false
  } catch (e) {
    console.error('Failed to save flowchart:', e)
    showAlert?.('儲存失敗', 'error')
  } finally {
    saving.value = false
  }
}

// Title editing
const startEditingTitle = () => {
  if (!canEdit.value) return
  editingTitle.value = true
  setTimeout(() => {
    titleInput.value?.focus()
    titleInput.value?.select()
  }, 50)
}

const saveTitle = async () => {
  editingTitle.value = false
  if (!note.value || localTitle.value === note.value.title) return
  
  try {
    await api.updateNote(note.value.id, { title: localTitle.value })
    note.value.title = localTitle.value
  } catch (e) {
    console.error('Failed to save title:', e)
    localTitle.value = note.value.title
    showAlert?.('儲存標題失敗', 'error')
  }
}

const handleTitleKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveTitle()
  } else if (e.key === 'Escape') {
    editingTitle.value = false
    localTitle.value = note.value?.title || ''
  }
}

// Force save before leaving
const forceSave = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  if (diagramData.value && canEdit.value && note.value) {
    await saveFlowchart()
  }
  // Mark Draw.io as saved to prevent its beforeunload warning
  flowchartRef.value?.markAsSaved?.()
}

// Handle beforeunload event
const handleBeforeUnload = (e) => {
  if (canEdit.value && note.value) {
    forceSave()
    // e.preventDefault()
  }
}

// UI functions
const toggleOnlineUsersPopup = () => {
  showOnlineUsersPopup.value = !showOnlineUsersPopup.value
}

const shareNote = () => {
  noteInfoModalTab.value = 'share'
  showNoteInfoModal.value = true
}

// Export flowchart
const exportFlowchart = (format = 'json') => {
  if (!diagramData.value || !note.value) return
  
  let content, mimeType, extension
  
  if (format === 'json') {
    content = JSON.stringify(diagramData.value, null, 2)
    mimeType = 'application/json'
    extension = 'flowchart.json'
  } else if (format === 'xml') {
    content = diagramData.value.xml || ''
    mimeType = 'application/xml'
    extension = 'drawio'
  } else if (format === 'svg') {
    content = flowchartRef.value?.exportAsSvg() || ''
    mimeType = 'image/svg+xml'
    extension = 'svg'
  }
  
  if (!content) {
    showAlert?.('無法匯出', 'error')
    return
  }
  
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${localTitle.value || 'flowchart'}.${extension}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  showNoteMenu.value = false
  showAlert?.('已匯出流程圖', 'success')
}

const handleDocumentClick = (e) => {
  if (showOnlineUsersPopup.value) {
    const isOnlineUsersBtn = e.target.closest('[data-online-users-btn]')
    const isOnlineUsersPopup = e.target.closest('[data-online-users-popup]')
    if (!isOnlineUsersBtn && !isOnlineUsersPopup) {
      showOnlineUsersPopup.value = false
    }
  }
}

// Sidebar functions
const setGlobalViewMode = (m) => {
  globalViewMode.value = m
  localStorage.setItem('NoteHubMD-viewMode', m)
}

const createNewNote = async () => {
  try {
    const newNote = await api.createNote()
    window.location.href = '/n/' + newNote.id
  } catch (e) {
    console.error('Failed to create note:', e)
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

// Permission & settings handlers
const handlePermissionChange = async (newPerm) => {
  try {
    await api.updateNote(note.value.id, { permission: newPerm })
    permission.value = newPerm
  } catch (e) {
    console.error('Failed to update permission:', e)
    showAlert?.('更新權限失敗', 'error')
  }
}

const setTheme = (t) => {
  theme.value = t  // Update reactive ref for child components
  if (t === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  localStorage.setItem('NoteHubMD-theme', t)
}

const toggleTheme = () => {
  const newTheme = theme.value === 'dark' ? 'light' : 'dark'
  theme.value = newTheme
  setTheme(newTheme)
}

const logout = async () => {
  await api.logout()
  window.location.href = '/login'
}

const handleCreateBook = async (data) => {
  try {
    const newBook = await api.createBook(data)
    showCreateBookModal.value = false
    router.push('/b/' + newBook.id)
  } catch (e) {
    showAlert?.('建立書本失敗', 'error')
  }
}

const handleUserProfileUpdate = (updatedUser) => {
  if (updatedUser) {
    currentUser.value = { ...currentUser.value, ...updatedUser }
  }
}

const handleTitleUpdate = async (newTitle) => {
  if (!note.value || newTitle === note.value.title) return
  try {
    await api.updateNote(note.value.id, { title: newTitle })
    note.value.title = newTitle
    localTitle.value = newTitle
  } catch (e) {
    console.error('Failed to update title:', e)
    showAlert?.('更新標題失敗', 'error')
  }
}

// Tags management
const editableTags = ref([])
const newTagInput = ref('')

watch(() => note.value?.tags, (newTags) => {
  editableTags.value = newTags ? [...newTags] : []
}, { immediate: true })

const addTag = async () => {
  const tag = newTagInput.value?.trim()
  if (!tag || !note.value) return
  if (editableTags.value.includes(tag)) return
  
  editableTags.value.push(tag)
  newTagInput.value = ''
  try {
    await api.updateNote(note.value.id, { tags: editableTags.value })
    note.value.tags = [...editableTags.value]
  } catch (e) {
    editableTags.value = editableTags.value.filter(t => t !== tag)
    showAlert?.('新增標籤失敗', 'error')
  }
}

const removeTag = async (tag) => {
  if (!note.value) return
  const prevTags = [...editableTags.value]
  editableTags.value = editableTags.value.filter(t => t !== tag)
  try {
    await api.updateNote(note.value.id, { tags: editableTags.value })
    note.value.tags = [...editableTags.value]
  } catch (e) {
    editableTags.value = prevTags
    showAlert?.('移除標籤失敗', 'error')
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

const handleIsPublicUpdate = async (isPublic) => {
  if (!note.value) return
  try {
    await api.updateNote(note.value.id, { isPublic })
    note.value.isPublic = isPublic
  } catch (e) {
    showAlert?.('更新失敗', 'error')
  }
}

// Move note to book
const moveNoteToBook = async (bookId) => {
  if (!note.value) return
  try {
    await api.updateNote(note.value.id, { bookId: bookId || null })
    note.value.bookId = bookId || null
    
    if (bookId) {
      const targetBook = books.value.find(b => b.id === bookId)
      if (targetBook) {
        book.value = targetBook
      } else {
        try {
          book.value = await api.getBook(bookId)
        } catch (e) {
          loadFlowchart()
        }
      }
    } else {
      book.value = null
    }
    
    showAlert?.('筆記已移動', 'success')
  } catch (e) {
    console.error('Failed to move note:', e)
    showAlert?.('移動筆記失敗', 'error')
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadFlowchart()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  forceSave()
  if (note.value) {
    leaveNote(note.value.id)
    offUsersInNote()
    offPermissionChanged()
  }
  
  // Cleanup Yjs
  if (yjsInstance.value) {
    yjsInstance.value.destroy()
    yjsInstance.value = null
  }
})

// Watch for route changes
watch(noteId, (newId, oldId) => {
  if (oldId && note.value) {
    leaveNote(note.value.id)
    offUsersInNote()
    offPermissionChanged()
  }
  if (newId !== oldId) {
    forceSave()
    loadFlowchart()
  }
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
      <!-- Loading State -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <div class="loading-spinner"></div>
        <span class="ml-3">載入流程圖中...</span>
      </div>
      
      <!-- Flowchart Content -->
      <template v-else-if="note">
        <!-- Header -->
        <header class="bg-gray-200 dark:bg-gray-900 dark:text-white px-3 py-2 flex items-center shadow-md z-30 shrink-0 relative">
        <!-- Left: Title + Save Status -->
        <div class="flex-1 flex items-center space-x-2">
          <!-- Book Title -->
          <template v-if="book">
            <div class="relative group">
              <a :href="'/b/' + book.id" class="hover:text-blue-400 transition">
                <i class="fas fa-book mr-1"></i>{{ book.title }}
              </a>
            </div>
            <span class="text-gray-600">/</span>
          </template>
          
          <!-- Flowchart Title -->
          <span class="text-md bg-gray-300 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-xs">
            <i class="fas fa-project-diagram mr-1 text-teal-500"></i>
            <template v-if="editingTitle">
              <input
                ref="titleInput"
                v-model="localTitle"
                class="bg-transparent border-none outline-none text-md w-40"
                @blur="saveTitle"
                @keydown="handleTitleKeydown"
              />
            </template>
            <template v-else>
              <span :class="{ 'cursor-pointer hover:text-blue-400': canEdit }" @click="startEditingTitle">
                {{ localTitle }}
              </span>
            </template>
          </span>
          
          <!-- Save Status -->
          <span v-if="saving" class="text-xs text-gray-400 ml-2">儲存中...</span>
          <span v-else class="text-xs text-gray-500 ml-2">{{ lastSavedText }} 已儲存</span>
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
              <i class="fas fa-users text-xs"></i>
              <span class="font-medium">{{ onlineUsers.length }}</span>
            </button>
            <div v-if="showOnlineUsersPopup" 
                 data-online-users-popup
                 class="absolute right-0 top-full mt-2 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700 z-[60]">
              <div class="p-3">
                <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2">
                  <i class="fas fa-users mr-1"></i> 在線用戶 ({{ onlineUsers.length }})
                </div>
                <ul class="space-y-1 max-h-48 overflow-y-auto">
                  <li v-for="(user, index) in onlineUsers" :key="index" class="flex items-center text-sm text-gray-800 dark:text-gray-200 py-1">
                    <span class="w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-medium text-white shrink-0"
                          :class="user.username && user.username !== 'Guest' ? 'bg-blue-600' : 'bg-gray-500'">
                      {{ user.username?.charAt(0).toUpperCase() || '?' }}
                    </span>
                    <span class="truncate">{{ user.name || user.username || 'Guest' }} <span class="text-gray-500">@{{ user.username || 'Guest' }}</span></span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          <!-- Permission -->
          <button v-if="isOwner" @click="noteInfoModalTab = 'permission'; showNoteInfoModal = true;" 
                  class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
            <i class="fas fa-lock text-xs"></i>
            <span>{{ permissionOptions.find(o => o.value === permission)?.label || permission }}</span>
          </button>
          <!-- Read-only Badge -->
          <div v-if="!canEdit" class="flex items-center space-x-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded text-sm text-yellow-700 dark:text-yellow-400">
            <i class="fas fa-eye text-xs"></i>
            <span>唯讀</span>
          </div>

          <!-- Note Info -->
          <button v-if="canEdit || isOwner" @click="noteInfoModalTab = 'info'; showNoteInfoModal = true; showNoteMenu = false;" 
                  class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
            <i class="fas fa-cog text-xs"></i>
            <span>筆記設定</span>
          </button>
          
          <!-- Note Menu Dropdown (Export - only for editors) -->
          <div v-if="canEdit" class="relative">
            <button @click="showNoteMenu = !showNoteMenu" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
              <i class="fas fa-ellipsis-v text-xs"></i>
              <span>更多</span>
            </button>
            
            <div v-if="showNoteMenu" 
                 class="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[60]"
                 @click.stop>
              <button @click="noteInfoModalTab = 'data'; showNoteInfoModal = true; showNoteMenu = false;"
                      class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer rounded-t-lg">
                <i class="fas fa-file-export w-5 mr-2"></i>匯出筆記
              </button>
            </div>
            
            <div v-if="showNoteMenu" class="fixed inset-0 z-[55]" @click="showNoteMenu = false"></div>
          </div>
          
          <!-- Share -->
          <button v-if="canEdit || isOwner" @click="shareNote" 
                  class="flex items-center space-x-1 bg-transparent hover:bg-green-600 dark:bg-gray-800 border border-green-600 px-3 py-1 rounded text-sm text-green-600 dark:text-green-500 hover:text-white transition cursor-pointer">
            <i class="fas fa-share-alt text-xs"></i>
            <span>分享</span>
          </button>
        </div>
      </header>
      
      <!-- Draw.io Container -->
      <div class="flowchart-container flex-1">
        <DrawioEmbedWrapper
          ref="flowchartRef"
          :initialData="diagramData"
          :theme="computedFlowchartTheme"
          :readOnly="!canEdit"
          @change="handleFlowchartChange"
          @save="handleFlowchartChange"
        />
      </div>
    </template>
    </div>
    
    <!-- Info Modal -->
    <InfoModal
      :show="showNoteInfoModal"
      type="note"
      :item="noteInfoItem"
      :tab="noteInfoModalTab"
      :editable-permission="permission"
      :editable-tags="editableTags"
      :new-tag-input="newTagInput"
      :books="books"
      @close="showNoteInfoModal = false"
      @update:tab="noteInfoModalTab = $event"
      @update:title="handleTitleUpdate"
      @update:permission="handlePermissionChange"
      @update:newTag="newTagInput = $event"
      @add-tag="addTag"
      @remove-tag="removeTag"
      @update:shareId="handleShareIdUpdate"
      @update:shareAlias="handleShareAliasUpdate"
      @export-flowchart="exportFlowchart('xml')"
      @export-flowchart-svg="exportFlowchart('svg')"
      @update:isPublic="handleIsPublicUpdate"
      @move-note="moveNoteToBook"
    />
    
    <!-- Other Modals -->
    <SettingsModal 
      :show="showSettingsModal" 
      :user="currentUser" 
      :theme="theme" 
      :app-version="appVersion"
      :initial-tab="settingsInitialTab"
      @close="showSettingsModal = false; settingsInitialTab = ''"
      @set-theme="setTheme"
      @logout="logout"
      @open-about="showAboutModal = true"
      @user-updated="handleUserProfileUpdate"
    />
    
    <AboutModal :show="showAboutModal" :app-version="appVersion" @close="showAboutModal = false" />
    
    <CreateBookModal 
      :show="showCreateBookModal"
      @close="showCreateBookModal = false"
      @book-created="handleCreateBook"
    />
  </div>
</template>

<style scoped>
.flowchart-container {
  display: flex;
  flex-direction: column;
  position: relative;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color, #e0e0e0);
  border-top-color: var(--primary, #0066cc);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Sidebar transition */
.note-sidebar-slide-enter-active,
.note-sidebar-slide-leave-active {
  transition: opacity 0.2s ease;
}
.note-sidebar-slide-enter-active > div:last-child,
.note-sidebar-slide-leave-active > div:last-child {
  transition: transform 0.2s ease;
}
.note-sidebar-slide-enter-from,
.note-sidebar-slide-leave-to {
  opacity: 0;
}
.note-sidebar-slide-enter-from > div:last-child,
.note-sidebar-slide-leave-to > div:last-child {
  transform: translateX(-100%);
}
</style>
