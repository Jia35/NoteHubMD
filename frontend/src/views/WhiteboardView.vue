<script setup>
/**
 * WhiteboardView - Excalidraw whiteboard editing page
 * Similar structure to NoteView.vue but for excalidraw type notes
 */
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import ExcalidrawWrapper from '@/components/whiteboard/ExcalidrawWrapper.vue'
import InfoModal from '@/components/common/InfoModal.vue'
import SidebarNav from '@/components/common/SidebarNav.vue'
import { SettingsModal, AboutModal, CreateBookModal } from '@/components'
import { useSocket } from '@/composables/useSocket'
import { useYjs } from '@/composables/useYjs'
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

// Whiteboard theme preference (auto, light, dark)
const whiteboardThemeSetting = ref(localStorage.getItem('NoteHubMD-whiteboardTheme') || 'auto')

// Computed theme for whiteboard (respects user preference)
const computedWhiteboardTheme = computed(() => {
  if (whiteboardThemeSetting.value === 'auto') {
    return theme.value
  }
  return whiteboardThemeSetting.value
})

// State
const note = ref(null)
const loading = ref(true)
const saving = ref(false)
const lastSaved = ref(null)
const diagramData = ref({ elements: [], appState: {}, files: {} })
const canEdit = ref(false)
const isOwner = ref(false)
const excalidrawRef = ref(null)
const permission = ref('private')
const currentUser = ref(null)
const books = ref([])
const book = ref(null)

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
const pinnedItems = ref([]) // 空陣列代替，避免模板報錯
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')
const appVersion = ref('')
const showSettingsModal = ref(false)
const settingsInitialTab = ref('')
const showCreateBookModal = ref(false)
const showAboutModal = ref(false)

// Permission options (same as NoteView)
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

// Note info for InfoModal
const noteInfoItem = computed(() => ({
  ...note.value,
  isOwner: isOwner.value,
  canEdit: canEdit.value
}))

// Sidebar computed
const currentRoute = computed(() => '/n/' + route.params.id)
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return books.value.filter(b => b.isOwner)
  }
  return books.value.filter(b => b.isPublic)
})

const hasUnsavedChanges = ref(false)
const isReady = ref(false)
const isApplyingRemoteUpdate = ref(false)

// Yjs collaboration instance (must be declared before computed that uses it)
const yjsInstance = ref(null)

// Remote cursors as reactive array for v-for (updated via callback)
const remoteCursorsArray = ref([])

// Load whiteboard data
const loadWhiteboard = async () => {
  loading.value = true
  try {
    const data = await api.getNote(noteId.value)
    
    // If not a whiteboard, redirect to note view
    if (data.noteType !== 'excalidraw') {
      router.replace(`/n/${noteId.value}`)
      return
    }
    
    note.value = data
    localTitle.value = data.title || 'Untitled Whiteboard'
    diagramData.value = data.diagramData || { elements: [], appState: {}, files: {} }
    canEdit.value = data.canEdit
    isOwner.value = data.isOwner
    permission.value = data.permission || 'private'
    lastSaved.value = data.lastEditedAt || data.updatedAt
    
    // Fetch current user for socket
    try {
      currentUser.value = await api.getMe()
    } catch (e) {
      currentUser.value = null
    }
    
    // Fetch books for InfoModal
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
    
    // Fetch app version for sidebar
    try {
      const versionData = await api.getAppVersion()
      appVersion.value = versionData.version
    } catch (e) {
      appVersion.value = ''
    }
    
    // Join socket room for online users with actual username
    const username = currentUser.value?.username || 'Guest'
    const name = currentUser.value?.name || null
    joinNote(data.id, username, name)
    onUsersInNote((users) => {
      onlineUsers.value = users
    })
    onPermissionChanged((data) => {
      permission.value = data.permission
      // Reload to get updated canEdit status
      loadWhiteboard()
    })
  } catch (e) {
    console.error('Failed to load whiteboard:', e)
    if (e.message?.includes('404') || e.message?.includes('not found')) {
      router.replace('/404')
    } else if (e.message?.includes('401')) {
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
    } else {
      showAlert?.('載入白板失敗', 'error')
    }
  } finally {
    loading.value = false
    
    // Initialize Yjs collaboration after loading
    if (note.value) {
        initYjsCollaboration()
    }
    
    // Reset dirty flag
    hasUnsavedChanges.value = false
    isReady.value = false
    
    // Delay ready state to avoid initial Excalidraw onChange events
    setTimeout(() => {
        isReady.value = true
    }, 1500)
  }
}

// Auto-save with debounce
let saveTimeout = null

// Throttle control for Yjs sync
let lastBroadcastTime = 0
const BROADCAST_THROTTLE = 500 // 500ms

// Initialize Yjs collaboration
const initYjsCollaboration = () => {
    const username = currentUser.value?.username || 'Guest'
    console.log('[Yjs] Initializing collaboration for note:', note.value.id, 'user:', username)
    
    yjsInstance.value = useYjs(note.value.id, username)

    // Wait for sync then initialize data
    let checkSyncInterval = null
    checkSyncInterval = setInterval(() => {
        if (!yjsInstance.value) {
            clearInterval(checkSyncInterval)
            return
        }
        
        if (yjsInstance.value.synced.value) {
            clearInterval(checkSyncInterval)
            console.log('[Yjs] Initial sync complete')
            
            // If Yjs is empty, initialize with database data
            const yjsElements = yjsInstance.value.getElements()
            // console.log('[Yjs] Elements in Yjs:', yjsElements.length, 'Elements in DB:', diagramData.value?.elements?.length || 0)
            
            if (yjsElements.length === 0 && diagramData.value?.elements?.length > 0) {
                // console.log('[Yjs] Initializing Yjs with database data')
                yjsInstance.value.setElements(diagramData.value.elements)
            } else if (yjsElements.length > 0) {
                // Use Yjs data
                // console.log('[Yjs] Using Yjs data')
                diagramData.value = { ...diagramData.value, elements: yjsElements }
                
                isApplyingRemoteUpdate.value = true
                excalidrawRef.value?.updateScene({ elements: yjsElements })
                setTimeout(() => isApplyingRemoteUpdate.value = false, 300)
            }
        }
    }, 100)
    
    // Timeout after 10 seconds if not synced
    setTimeout(() => {
        if (yjsInstance.value && !yjsInstance.value.synced.value) {
            // console.warn('[Yjs] Sync timeout - connection may have failed')
            clearInterval(checkSyncInterval)
        }
    }, 10000)

    // Listen for remote changes
    yjsInstance.value.onRemoteChange((elements) => {
        // console.log('[Yjs] Remote change received, elements:', elements.length)
        diagramData.value = { ...diagramData.value, elements }
        
        isApplyingRemoteUpdate.value = true
        excalidrawRef.value?.updateScene({ elements })
        setTimeout(() => isApplyingRemoteUpdate.value = false, 300)
    })
    
    // Subscribe to cursor updates (bypass Vue's nested ref reactivity issues)
    yjsInstance.value.onCursorsChange((cursorsArray) => {
        // console.log('[Yjs] Cursors callback, count:', cursorsArray.length)
        remoteCursorsArray.value = cursorsArray
    })
}

const handleWhiteboardChange = (data) => {
  if (!canEdit.value || !note.value) return
  
  diagramData.value = data
  
  // Only mark as unsaved if ready and not applying valid remote updates
  if (isReady.value && !isApplyingRemoteUpdate.value) {
    hasUnsavedChanges.value = true
  }
  
  // Throttled sync to Yjs (every 500ms max)
  const now = Date.now()
  if (now - lastBroadcastTime >= BROADCAST_THROTTLE && yjsInstance.value) {
      lastBroadcastTime = now
      yjsInstance.value.setElements(data.elements)
  }
  
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  // Debounce save to database (2 seconds after last change)
  saveTimeout = setTimeout(() => {
    saveWhiteboard()
  }, 2000)
}

// Handle pointer move for cursor sync
let lastCursorTime = 0
const CURSOR_THROTTLE = 50 // 50ms
const handlePointerUpdate = (e) => {
    if (!yjsInstance.value) return
    
    // Throttle cursor updates
    const now = Date.now()
    if (now - lastCursorTime < CURSOR_THROTTLE) return
    lastCursorTime = now
    
    const container = document.querySelector('.whiteboard-container')
    if (!container) return
    
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    yjsInstance.value.updateCursor(x, y)
}

const saveWhiteboard = async (manual = false) => {
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
    console.error('Failed to save whiteboard:', e)
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

// Navigation
const goBack = () => {
  if (note.value?.bookId) {
    router.push(`/b/${note.value.bookId}`)
  } else {
    router.push('/')
  }
}

// Force save before leaving
const forceSave = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  if (diagramData.value && canEdit.value && note.value) {
    await saveWhiteboard()
  }
}

// Handle beforeunload event (browser close/refresh)
const handleBeforeUnload = (e) => {
  if (canEdit.value && note.value) {
    // Trigger synchronous save attempt
    forceSave()
    // Show browser confirmation dialog
    //e.preventDefault()
  }
}

// Right actions functions
const toggleOnlineUsersPopup = () => {
  showOnlineUsersPopup.value = !showOnlineUsersPopup.value
}

// Share note - opens modal with share tab
const shareNote = () => {
  noteInfoModalTab.value = 'share'
  showNoteInfoModal.value = true
}

// Export whiteboard as .excalidraw file
const exportWhiteboard = () => {
  if (!diagramData.value || !note.value) return
  
  // Get the current data from excalidraw ref if available
  let exportData = diagramData.value
  if (excalidrawRef.value?.getData) {
    exportData = excalidrawRef.value.getData()
  }
  
  // Create final export structure matching Excalidraw format
  const finalData = {
    type: 'excalidraw',
    version: 2,
    source: window.location.origin,
    elements: exportData.elements || [],
    appState: {
      ...(exportData.appState || {}),
      viewBackgroundColor: exportData.appState?.viewBackgroundColor || '#ffffff',
      currentItemFontFamily: exportData.appState?.currentItemFontFamily || 1
    },
    files: exportData.files || {}
  }
  
  // Create the file content
  const jsonContent = JSON.stringify(finalData, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json' })
  
  // Create download link
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${localTitle.value || 'whiteboard'}.excalidraw`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  showNoteMenu.value = false
  showAlert?.('已匯出白板', 'success')
}

// Export as Image
const saveAsImage = async (type = 'png') => {
  if (!diagramData.value) return
  
  try {
    showAlert('正在匯出圖片...', 'info')
    
    // Dynamic import to avoid large bundle size
    // Note: This relies on the fact that standard Excalidraw package exports these utils
    // If using a custom wrapper that bundles excalidraw, we might need a different approach,
    // but typically we can import from the package if it's installed.
    const { exportToBlob, exportToSvg } = await import('@excalidraw/excalidraw')
    
    // Get current elements and app state
    let elements = diagramData.value.elements || []
    let appState = diagramData.value.appState || {}
    let files = diagramData.value.files || {}
    
    // Try to get freshest data from ref
    if (excalidrawRef.value?.getData) {
      const data = excalidrawRef.value.getData()
      elements = data.elements
      // If elements are deleted they might remain in array with isDeleted:true
      // Excalidraw export usually handles this but good to be aware
      appState = data.appState || appState
      files = data.files || files
    }
    
    const exportConfig = {
      elements,
      appState: {
        ...appState,
        exportWithDarkMode: false,
        viewBackgroundColor: appState.viewBackgroundColor || '#ffffff'
      },
      files,
      mimeType: type === 'png' ? 'image/png' : 'image/svg+xml',
    }

    if (type === 'png') {
      const blob = await exportToBlob(exportConfig)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${localTitle.value || 'whiteboard'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      const svg = await exportToSvg(exportConfig)
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(svg)
      const blob = new Blob([svgString], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${localTitle.value || 'whiteboard'}.svg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
    
    showAlert('圖片匯出成功', 'success')
    showNoteInfoModal.value = false
  } catch (e) {
    console.error('Export failed:', e)
    showAlert('匯出失敗: ' + e.message, 'error')
  }
}

// Click outside handlers
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

// Handle permission change from InfoModal
const handlePermissionChange = async (newPerm) => {
  try {
    await api.updateNote(note.value.id, { permission: newPerm })
    permission.value = newPerm
  } catch (e) {
    console.error('Failed to update permission:', e)
    showAlert?.('更新權限失敗', 'error')
  }
}

// Settings Modal handlers
const setTheme = (t) => {
  if (t === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  localStorage.setItem('NoteHubMD-theme', t)
}

// Toggle theme (light/dark)
const toggleTheme = () => {
  const newTheme = theme.value === 'dark' ? 'light' : 'dark'
  theme.value = newTheme
  setTheme(newTheme)
}

const logout = async () => {
  await api.logout()
  window.location.href = '/login'
}

// Create book handler
const handleCreateBook = async (data) => {
  try {
    const newBook = await api.createBook(data)
    showCreateBookModal.value = false
    router.push('/b/' + newBook.id)
  } catch (e) {
    showAlert?.('建立書本失敗', 'error')
  }
}

// User profile update handler
const handleUserProfileUpdate = (updatedUser) => {
  if (updatedUser) {
    currentUser.value = { ...currentUser.value, ...updatedUser }
  }
}

// Handle title update from InfoModal
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

// Tags management for whiteboard notes
const editableTags = ref([])
const newTagInput = ref('')

// Sync editable tags when note loads
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
    
    // Update local book reference
    if (bookId) {
      // If we have the books list loaded, try to find the book object
      const targetBook = books.value.find(b => b.id === bookId)
      if (targetBook) {
        book.value = targetBook
      } else {
        // If not in list, try fetching it
        try {
          book.value = await api.getBook(bookId)
        } catch (e) {
          // If fetch fails, just clear book value to be safe or keep old one? 
          // Better to reload
          loadWhiteboard() 
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
  // Save on browser close/refresh
  window.addEventListener('beforeunload', handleBeforeUnload)
  loadWhiteboard()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  // Save any pending changes
  forceSave()
  // Cleanup Yjs
  if (yjsInstance.value) {
      yjsInstance.value.destroy()
  }
  // Leave socket room
  if (note.value) {
    leaveNote(note.value.id)
    offUsersInNote()
    offPermissionChanged()
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
    loadWhiteboard()
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
        <span class="ml-3">載入白板中...</span>
      </div>
      
      <!-- Whiteboard Content -->
      <template v-else-if="note">
        <!-- Header (matching NoteView styling) -->
        <header class="bg-gray-200 dark:bg-gray-900 dark:text-white px-3 py-2 flex items-center shadow-md z-30 shrink-0 relative">
        <!-- Left: Back + Title + Save Status -->
        <div class="flex-1 flex items-center space-x-2">
          <!-- <button @click="goBack" 
                  class="px-2 py-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer"
                  title="返回">
            <i class="fas fa-arrow-left"></i>
          </button> -->
          
          <!-- Book Title with Notes Tooltip -->
          <template v-if="book">
            <div class="relative group">
              <a :href="'/b/' + book.id" class="hover:text-blue-400 transition">
                <i class="fas fa-book mr-1"></i>{{ book.title }}
              </a>
              <!-- Book Notes Tooltip -->
              <div v-if="book.Notes && book.Notes.length > 0" class="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
                <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700" style="min-width: 280px; max-width: 400px;">
                  <!-- Arrow -->
                  <div class="absolute top-0 left-4 w-4 h-4 bg-gray-200 dark:bg-gray-800 border-t border-l border-gray-300 dark:border-gray-700 transform rotate-45"></div>
                  <div class="relative z-10 p-3">
                    <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                      <i class="fas fa-list mr-2"></i>
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
          
          <!-- Whiteboard Title -->
          <span class="text-md bg-gray-300 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-xs">
            <i class="fas fa-chalkboard mr-1 text-purple-500"></i>
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
            
            <!-- Click outside to close -->
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
      
      <!-- Excalidraw Container -->
      <div class="whiteboard-container" @pointermove="handlePointerUpdate">
        <ExcalidrawWrapper
          ref="excalidrawRef"
          :initialData="diagramData"
          :theme="computedWhiteboardTheme"
          :readOnly="!canEdit"
          @change="handleWhiteboardChange"
        />
        
        <!-- Remote Cursors Overlay -->
        <div class="remote-cursors-layer">
            <!-- DEBUG INFO -->
            <!-- <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.5); color: white; padding: 5px; z-index: 2000; font-size: 10px;">
                Cursors: {{ remoteCursorsArray.length }}
                <div v-for="[id, c] in remoteCursorsArray" :key="id">
                    {{ c.username }}: {{ c.x.toFixed(0) }}, {{ c.y.toFixed(0) }}
                </div>
            </div> -->

            <div 
                v-for="[clientId, cursor] in remoteCursorsArray" 
                :key="clientId"
                class="remote-cursor"
                :style="{ 
                    left: cursor.x + 'px', 
                    top: cursor.y + 'px'
                }"
            >
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M5 2L19 12L12 13L9 20L5 2Z" :fill="cursor.color"/>
                </svg>
                <span class="cursor-label" :style="{ background: cursor.color }">
                    {{ cursor.username }}
                </span>
            </div>
        </div>
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
      @update:isPublic="handleIsPublicUpdate"
      @move-note="moveNoteToBook"
      @export-whiteboard="exportWhiteboard"
      @export-whiteboard-png="saveAsImage('png')"
      @export-whiteboard-svg="saveAsImage('svg')"
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
.whiteboard-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.whiteboard-view.dark {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --text-primary: #d4d4d4;
  --text-secondary: #808080;
  --border-color: #3c3c3c;
}

/* Loading */
.whiteboard-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 1rem;
  color: var(--text-secondary, #666);
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

/* Header */
.whiteboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  background: var(--bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.back-btn {
  padding: 0.35rem 0.5rem;
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  color: var(--text-primary, #333);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--bg-primary, #fff);
  border-color: var(--primary, #0066cc);
  color: var(--primary, #0066cc);
}

/* Title */
.title-container {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title.editable {
  cursor: pointer;
}

.title.editable:hover {
  color: var(--primary, #0066cc);
}

.title-icon {
  color: var(--primary, #0066cc);
  font-size: 0.9rem;
}

.title-input {
  font-size: 1.1rem;
  font-weight: 600;
  padding: 0.2rem 0.4rem;
  border: 2px solid var(--primary, #0066cc);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  width: 100%;
  max-width: 400px;
}

/* Save Status */
.save-status {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
}

.save-status .text-success {
  color: var(--success, #28a745);
}

/* Readonly Badge */
.readonly-badge {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  background: var(--warning-bg, #fff3cd);
  color: var(--warning, #856404);
  border-radius: 6px;
  font-size: 0.75rem;
}

/* Action Buttons */
.action-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.5rem;
  background: var(--bg-tertiary, #e5e5e5);
  border: none;
  border-radius: 6px;
  color: var(--text-primary, #333);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--bg-hover, #d5d5d5);
}

.dark .action-btn {
  background: var(--bg-tertiary, #3c3c3c);
  color: var(--text-primary, #d4d4d4);
}

.dark .action-btn:hover {
  background: var(--bg-hover, #4a4a4a);
}

/* Share Button */
.share-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: 1px solid var(--success, #28a745);
  border-radius: 6px;
  color: var(--success, #28a745);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.share-btn:hover {
  background: var(--success, #28a745);
  color: white;
}

/* Popup Menu */
.popup-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 0.35rem;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 60;
}

.popup-header {
  padding: 0.5rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary, #666);
}

.popup-list {
  max-height: 200px;
  overflow-y: auto;
  list-style: none;
  padding: 0;
  margin: 0;
}

.popup-list-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-primary, #333);
}

.user-avatar {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.6rem;
  font-weight: 600;
  flex-shrink: 0;
}

/* Menu Dropdown */
.menu-dropdown {
  min-width: 140px;
}

.menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: none;
  border: none;
  text-align: left;
  font-size: 0.8rem;
  color: var(--text-primary, #333);
  cursor: pointer;
  transition: background 0.2s;
}

.menu-item:hover {
  background: var(--bg-hover, #f0f0f0);
}

.dark .popup-menu {
  background: var(--bg-secondary, #252526);
  border-color: var(--border-color, #3c3c3c);
}

.dark .popup-list-item,
.dark .menu-item {
  color: var(--text-primary, #d4d4d4);
}

.dark .menu-item:hover {
  background: var(--bg-hover, #3a3a3a);
}

/* Whiteboard Container */
.whiteboard-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Remote Cursors Layer */
.remote-cursors-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
  overflow: hidden;
}

.remote-cursor {
  position: absolute;
  transform: translate(-2px, -2px);
  transition: left 0.05s linear, top 0.05s linear;
  will-change: left, top;
}

.cursor-label {
  position: absolute;
  left: 16px;
  top: 12px;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

/* Dark mode adjustments */
.dark .whiteboard-header {
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

.dark .back-btn {
  border-color: var(--border-color);
  color: var(--text-primary);
}

.dark .title {
  color: var(--text-primary);
}

.dark .title-input {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--primary);
}

.dark .readonly-badge {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

/* Sidebar transition */
.note-sidebar-slide-enter-active,
.note-sidebar-slide-leave-active {
  transition: opacity 0.2s ease;
}

.note-sidebar-slide-enter-active > div:last-child,
.note-sidebar-slide-leave-active > div:last-child {
  transition: transform 0.25s ease;
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
