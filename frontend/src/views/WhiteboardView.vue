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
import { useSocket } from '@/composables/useSocket'
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
    
    // Join socket room for online users with actual username
    const username = currentUser.value?.username || 'Guest'
    joinNote(data.id, username)
    onUsersInNote((users) => {
      onlineUsers.value = users
    })
    onPermissionChanged((newPerm) => {
      permission.value = newPerm
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
  }
}

// Auto-save with debounce
let saveTimeout = null
const handleWhiteboardChange = (data) => {
  if (!canEdit.value || !note.value) return
  
  diagramData.value = data
  
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  // Debounce save (2 seconds after last change)
  saveTimeout = setTimeout(() => {
    saveWhiteboard()
  }, 2000)
}

const saveWhiteboard = async () => {
  if (saving.value || !note.value || !canEdit.value) return
  
  saving.value = true
  try {
    await api.updateNote(note.value.id, { 
      diagramData: diagramData.value 
    })
    lastSaved.value = new Date()
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

// Right actions functions
const toggleOnlineUsersPopup = () => {
  showOnlineUsersPopup.value = !showOnlineUsersPopup.value
}

// Share note - opens modal with share tab
const shareNote = () => {
  noteInfoModalTab.value = 'share'
  showNoteInfoModal.value = true
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

// Handle permission change from InfoModal
const handlePermissionChange = async (newPerm) => {
  try {
    await api.updateNote(note.value.id, { permission: newPerm })
    permission.value = newPerm
    showAlert?.('權限已更新', 'success')
  } catch (e) {
    console.error('Failed to update permission:', e)
    showAlert?.('更新權限失敗', 'error')
  }
}

// Lifecycle
onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  loadWhiteboard()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  // Save any pending changes
  forceSave()
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
  <div class="whiteboard-view" :class="{ 'dark': theme === 'dark' }">
    <!-- Loading State -->
    <div v-if="loading" class="whiteboard-loading">
      <div class="loading-spinner"></div>
      <span>載入白板中...</span>
    </div>
    
    <!-- Main Content -->
    <template v-else-if="note">
      <!-- Header (matching NoteView styling) -->
      <header class="bg-gray-200 dark:bg-gray-900 dark:text-white px-3 py-2 flex items-center shadow-md z-30 shrink-0 relative">
        <!-- Left: Back + Title + Save Status -->
        <div class="flex-1 flex items-center space-x-2">
          <button @click="goBack" 
                  class="px-2 py-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer"
                  title="返回">
            <i class="fas fa-arrow-left"></i>
          </button>
          
          <!-- Title -->
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
        <div class="flex-1 flex justify-end items-center space-x-3">
          <!-- Read-only Badge -->
          <div v-if="!canEdit" class="flex items-center space-x-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded text-sm text-yellow-700 dark:text-yellow-400">
            <i class="fas fa-eye text-xs"></i>
            <span>唯讀</span>
          </div>
          
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
                    <span class="truncate">{{ user.username || 'Guest' }}</span>
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
          
          <!-- Note Menu Dropdown -->
          <div class="relative">
            <button @click="showNoteMenu = !showNoteMenu" 
                    class="flex items-center space-x-1 bg-gray-300 hover:bg-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer">
              <i class="fas fa-ellipsis-v text-xs"></i>
              <span>更多</span>
              <i class="fas fa-chevron-down text-xs ml-1"></i>
            </button>
            
            <div v-if="showNoteMenu" 
                 class="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[60]"
                 @click.stop>
              <button @click="noteInfoModalTab = 'info'; showNoteInfoModal = true; showNoteMenu = false;"
                      class="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center cursor-pointer rounded-lg">
                <i class="fas fa-cog w-5 mr-2"></i>白板設定
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
      <div class="whiteboard-container">
        <ExcalidrawWrapper
          ref="excalidrawRef"
          :initialData="diagramData"
          :theme="theme"
          :readOnly="!canEdit"
          @change="handleWhiteboardChange"
        />
      </div>
    </template>
    
    <!-- Info Modal -->
    <InfoModal
      :show="showNoteInfoModal"
      type="note"
      :item="noteInfoItem"
      :tab="noteInfoModalTab"
      :editable-permission="permission"
      :books="books"
      @close="showNoteInfoModal = false"
      @update:tab="noteInfoModalTab = $event"
      @update:permission="handlePermissionChange"
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
</style>
