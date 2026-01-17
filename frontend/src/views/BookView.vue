<script setup>
import { ref, computed, onMounted, onUnmounted, inject, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { NoteCard, InfoModal } from '@/components'
import dayjs from 'dayjs'
import Sortable from 'sortablejs'

const route = useRoute()
const router = useRouter()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// Book data
const book = ref(null)
const loading = ref(true)
const notesList = ref(null)
let sortableInstance = null
const permission = ref('private')
const isOwner = ref(false)
const canEdit = ref(false)
const canAddNote = ref(false)

// Inject global sidebar data from App.vue
const user = inject('sidebarUser')
const sidebarBooks = inject('sidebarBooks')
// [DISABLED] 釘選功能暫時停用
// const pinnedItems = inject('sidebarPinnedItems')
const loadSidebarData = inject('loadSidebarData')
const updateSidebarBooks = inject('updateSidebarBooks')
// [DISABLED] 釘選功能暫時停用
// const updateSidebarPinnedItems = inject('updateSidebarPinnedItems')

const currentRoute = computed(() => route.path)

// Display mode
const displayMode = ref(localStorage.getItem('NoteHubMD-bookDisplayMode') || 'list')

// Menu state
const openMenuId = ref(null)
const showCreateMenu = ref(false)
const showBottomCreateMenu = ref(false)

// Info Modal state
const showInfoModal = ref(false)
const infoModalItem = ref(null)
const infoModalTab = ref('info')
const infoModalType = ref('note')  // 'note' or 'book'
const editablePermission = ref('private')
const infoCommentsEnabled = ref(true)

// Book Info Modal specific state
const editableDescription = ref('')
const editableTags = ref([])
const newTag = ref('')

// Books list for moving notes
const allBooks = ref([])

// Sorted notes
const sortedNotes = computed(() => {
  const notes = book.value?.Notes || book.value?.notes
  if (!notes) return []
  return [...notes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
})

// Available books for moving notes
const availableBooks = computed(() => {
  return allBooks.value.filter(b => b.isOwner || b.canEdit)
})

// Permission options
const permissionOptions = [
  { value: 'public-edit', label: '可編輯' },
  { value: 'auth-edit', label: '可編輯(需登入)' },
  { value: 'public-view', label: '公開' },
  { value: 'auth-view', label: '唯讀(需登入)' },
  { value: 'private', label: '私人' }
]

const permissionLabel = computed(() => {
  const opt = permissionOptions.find(o => o.value === permission.value)
  return opt?.label || permission.value
})

/* [DISABLED] 釘選功能暫時停用
// Check if item is pinned
// const isPinned = (type, id) => {
//   return pinnedItems?.value?.some(p => p.type === type && p.id === id) || false
// }
*/
// Stub function to avoid template errors
const isPinned = () => false

// Load book data (sidebar data is managed by App.vue)
const loadBook = async () => {
  loading.value = true
  try {
    // Load sidebar data if not already loaded
    await loadSidebarData()
    allBooks.value = sidebarBooks.value

    const data = await api.getBook(route.params.id)
    
    // Normalize API response: Map Notes (capitalized) to notes (lowercase)
    if (data.Notes) {
      data.notes = data.Notes
      delete data.Notes
    }
    
    book.value = data
    if (!book.value.tags) book.value.tags = []
    // Ensure these properties are on the book object for InfoModal
    book.value.isOwner = data.isOwner || false
    book.value.canEdit = data.canEdit || false
    permission.value = data.permission || 'private'
    isOwner.value = data.isOwner || false
    canEdit.value = data.canEdit || false
    canAddNote.value = data.canAddNote || false
    
    // Update browser tab title
    const shortTitle = (data.title || 'Untitled').substring(0, 20)
    document.title = `${shortTitle} | NoteHubMD`
    
    // Initialize sortable after DOM update
    nextTick(() => initSortable())
  } catch (e) {
    console.error('Failed to load book', e)
    if (e.message?.includes('Login required')) {
      showAlert?.('需要登入才能存取此書本', 'error')
      router.push('/login')
      return
    } else if (e.message?.includes('Access denied')) {
      showAlert?.('您沒有權限存取此書本', 'error')
      router.push('/')
      return
    } else if (e.message?.includes('not found')) {
      window.location.href = '/404'
      return
    }
    showAlert?.('載入書本失敗', 'error')
    router.push('/')
  } finally {
    loading.value = false
  }
}

// Initialize SortableJS
const initSortable = async () => {
  // Wait for DOM to update before accessing refs
  await nextTick()
  
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
  // Check if Sortable is available and notesList exists
  if (!Sortable || !notesList.value || !canEdit.value) return

  sortableInstance = new Sortable(notesList.value, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: async (evt) => {
      if (evt.oldIndex === evt.newIndex) return

      // Get new order of note IDs
      const noteIds = Array.from(notesList.value.querySelectorAll('[data-id]'))
        .map(el => el.dataset.id)

      try {
        await api.reorderBookNotes(book.value.id, noteIds)
        // We rely on the DOM order here until next reload
      } catch (e) {
        console.error('Failed to reorder notes', e)
        showAlert?.('排序失敗', 'error')
        // Reload to restore original order
        loadBook()
      }
    }
  })
}

// Create note in book
const createNote = async (type = 'markdown') => {
  if (!book.value) return
  try {
    const note = await api.createNoteInBook(book.value.id, type)
    window.location.href = '/n/' + note.id
  } catch (e) {
    if (e.message?.includes('Cannot add notes')) {
      showAlert?.('您沒有權限在此書本新增筆記', 'error')
    } else {
      showAlert?.('建立筆記失敗', 'error')
    }
  }
}

// Open note
const openNote = (note) => {
  window.location.href = '/n/' + note.id
}

// Toggle menu
const toggleMenu = (id) => {
  openMenuId.value = openMenuId.value === id ? null : id
}

const toggleCreateMenu = () => {
    showCreateMenu.value = !showCreateMenu.value
}

const toggleBottomCreateMenu = () => {
    showBottomCreateMenu.value = !showBottomCreateMenu.value
}

// Close menu
const closeMenu = () => {
  openMenuId.value = null
  showCreateMenu.value = false
  showBottomCreateMenu.value = false
}

// Toggle pin
const togglePin = async (type, noteId) => {
  // TODO: implement pin functionality
  closeMenu()
}

// Delete note
const deleteNote = async (noteId) => {
  const note = book.value?.notes?.find(n => n.id === noteId)
  const title = note?.title || 'Untitled'
  const confirmed = await showConfirm?.(`確定要刪除「${title}」嗎？（可從垃圾桶還原）`, '刪除確認')
  if (!confirmed) return
  try {
    await api.deleteNote(noteId)
    book.value.notes = book.value.notes.filter(n => n.id !== noteId)
    closeMenu()
  } catch (e) {
    showAlert?.('刪除失敗', 'error')
  }
}

// Open Info Modal
const openInfoModal = (item, tab = 'info', type = 'book') => {
  if (!book.value) return
  infoModalType.value = type
  infoModalItem.value = item || book.value
  infoModalTab.value = tab
  
  if (type === 'note') {
    // For notes, use the note's data
    editablePermission.value = item.permission || 'inherit'
    infoCommentsEnabled.value = item.commentsEnabled !== false
    // Set editable tags for the note
    editableTags.value = item.tags ? [...item.tags] : []
  } else {
    // For books, use the book's data
    editableDescription.value = book.value.description || ''
    editableTags.value = book.value.tags ? [...book.value.tags] : []
    editablePermission.value = book.value.permission || 'private'
  }
  showInfoModal.value = true
}

// Auto save book description
const autoSaveBookDescription = async (desc) => {
  editableDescription.value = desc
  try {
    await api.updateBook(book.value.id, { description: desc })
    book.value.description = desc
  } catch (e) {
    showAlert?.('更新描述失敗', 'error')
  }
}

// Add tag to book or note
const addEditableTag = async (tagArg) => {
  const tag = tagArg || newTag.value?.trim()
  if (!tag || editableTags.value.includes(tag)) return
  editableTags.value.push(tag)
  newTag.value = ''
  try {
    if (infoModalType.value === 'note' && infoModalItem.value) {
      // Update note tags
      await api.updateNote(infoModalItem.value.id, { tags: editableTags.value })
      const noteInList = book.value.notes.find(n => n.id === infoModalItem.value.id)
      if (noteInList) noteInList.tags = [...editableTags.value]
    } else {
      // Update book tags
      await api.updateBook(book.value.id, { tags: editableTags.value })
      book.value.tags = [...editableTags.value]
    }
  } catch (e) {
    showAlert?.('新增標籤失敗', 'error')
    editableTags.value = editableTags.value.filter(t => t !== tag)
  }
}

// Remove tag from book or note
const removeEditableTag = async (tag) => {
  const prevTags = [...editableTags.value]
  editableTags.value = editableTags.value.filter(t => t !== tag)
  try {
    if (infoModalType.value === 'note' && infoModalItem.value) {
      // Update note tags
      await api.updateNote(infoModalItem.value.id, { tags: editableTags.value })
      const noteInList = book.value.notes.find(n => n.id === infoModalItem.value.id)
      if (noteInList) noteInList.tags = [...editableTags.value]
    } else {
      // Update book tags
      await api.updateBook(book.value.id, { tags: editableTags.value })
      book.value.tags = [...editableTags.value]
    }
  } catch (e) {
    showAlert?.('移除標籤失敗', 'error')
    editableTags.value = prevTags
  }
}

// Handle title update from InfoModal (for whiteboard notes)
const handleTitleUpdate = async (newTitle) => {
  if (!infoModalItem.value || infoModalType.value !== 'note') return
  if (newTitle === infoModalItem.value.title) return
  try {
    await api.updateNote(infoModalItem.value.id, { title: newTitle })
    infoModalItem.value.title = newTitle
    // Update in notes list as well
    const noteInList = book.value.notes.find(n => n.id === infoModalItem.value.id)
    if (noteInList) noteInList.title = newTitle
  } catch (e) {
    showAlert?.('更新標題失敗', 'error')
  }
}

// Share book - open info modal with share tab
const shareBook = () => {
  openInfoModal(book.value, 'share', 'book')
}

// Auto save permission
const autoSavePermission = async (newPermission) => {
  if (!infoModalItem.value) return
  editablePermission.value = newPermission
  try {
    if (infoModalType.value === 'book') {
      await api.updateBookPermission(infoModalItem.value.id, newPermission)
      if (book.value) book.value.permission = newPermission
      permission.value = newPermission
    } else {
      await api.updateNote(infoModalItem.value.id, { permission: newPermission })
      const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
      if (note) note.permission = newPermission
    }
  } catch (e) {
    showAlert?.('更新權限失敗', 'error')
  }
}

// Auto save comments enabled
const autoSaveCommentsEnabled = async (enabled) => {
  if (!infoModalItem.value) return
  infoCommentsEnabled.value = enabled
  try {
    await api.updateNote(infoModalItem.value.id, { commentsEnabled: enabled })
    const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
    if (note) note.commentsEnabled = enabled
  } catch (e) {
    showAlert?.('更新失敗', 'error')
  }
}

// Auto save isPublic
// Auto save isPublic
const autoSaveIsPublic = async (isPublic) => {
  if (!infoModalItem.value) return
  try {
    if (infoModalType.value === 'book') {
      await api.updateBook(infoModalItem.value.id, { isPublic })
      if (book.value) book.value.isPublic = isPublic
    } else {
      await api.updateNote(infoModalItem.value.id, { isPublic })
      const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
      if (note) note.isPublic = isPublic
    }
    infoModalItem.value.isPublic = isPublic
  } catch (e) {
    showAlert?.('更新失敗', 'error')
  }
}

// Share update handlers
const handleShareIdUpdate = (newShareId) => {
  if (!infoModalItem.value) return
  infoModalItem.value.shareId = newShareId
  
  if (infoModalType.value === 'book') {
     if (book.value) book.value.shareId = newShareId
  } else {
     if (book.value && book.value.notes) {
       const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
       if (note) note.shareId = newShareId
     }
  }
}

const handleShareAliasUpdate = (newAlias) => {
  if (!infoModalItem.value) return
  infoModalItem.value.shareAlias = newAlias
  
  if (infoModalType.value === 'book') {
     if (book.value) book.value.shareAlias = newAlias
  } else {
     if (book.value && book.value.notes) {
       const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
       if (note) note.shareAlias = newAlias
     }
  }
}

// Move note from info modal
const handleMoveNoteFromInfo = async (targetBookId) => {
  if (!infoModalItem.value) return
  try {
    await api.updateNote(infoModalItem.value.id, { bookId: targetBookId })
    // Remove from current book if moved elsewhere
    if (targetBookId !== book.value.id) {
      book.value.notes = book.value.notes.filter(n => n.id !== infoModalItem.value.id)
      showInfoModal.value = false
      showAlert?.('筆記已移動', 'success')
    }
  } catch (e) {
    showAlert?.('移動失敗', 'error')
  }
}

// Set display mode
const setDisplayMode = (mode) => {
  displayMode.value = mode
  localStorage.setItem('NoteHubMD-bookDisplayMode', mode)
}

// Format date
const formatDate = (date) => {
  return window.dayjs ? window.dayjs(date).format('YYYY/MM/DD HH:mm') : new Date(date).toLocaleDateString()
}

// Sidebar handlers
const setGlobalViewMode = (mode) => {
  globalViewMode.value = mode
  localStorage.setItem('NoteHubMD-viewMode', mode)
}

/* [DISABLED] 釘選功能暫時停用
const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id))
  } catch (e) {
    showAlert?.('取消釘選失敗', 'error')
  }
}
*/

const createSidebarNote = async () => {
  try {
    const note = await api.createNote()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert?.('建立筆記失敗', 'error')
  }
}

// Handle click outside to close menu
onMounted(() => {
  loadBook()
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
})


// Watch route changes
watch(() => route.params.id, () => {
  loadBook()
})
</script>

<template>
  <div class="h-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text container mx-auto px-8 py-5 flex-1 overflow-y-auto">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
    </div>

    <!-- Content -->
    <div v-else-if="book" class="h-full">
      <div class="mb-6 flex items-center text-gray-500 dark:text-gray-400">
          <router-link to="/" class="hover:text-blue-500">Home</router-link>
          <span class="mx-2">/</span>
          <span>{{ book.title }}</span>
      </div>

      <div class="flex justify-between items-center mb-4">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-3">
              <i class="fa-solid fa-book text-blue-600"></i>
              {{ book.title }}
            </h1>
          <div class="flex items-center gap-3">
              <div v-if="canAddNote" class="relative inline-block text-left mr-2" ref="topCreateMenuCtn">
                  <div class="flex shadow-sm rounded-md">
                      <button @click="createNote('markdown')" class="bg-blue-600 text-white px-3 py-1 rounded-l text-sm hover:bg-blue-700 transition cursor-pointer flex items-center border-r border-blue-700">
                          <i class="fa-solid fa-plus mr-1"></i>新增筆記
                      </button>
                      <button @click.stop="toggleCreateMenu" class="bg-blue-600 text-white px-2 py-1 rounded-r text-sm hover:bg-blue-700 transition cursor-pointer">
                          <i class="fa-solid fa-chevron-down text-xs"></i>
                      </button>
                  </div>
                  <!-- Dropdown Content -->
                  <div v-if="showCreateMenu" class="absolute right-0 mt-2 w-full min-w-[6rem] bg-white dark:bg-gray-800 border-2 border-blue-600 rounded-md shadow-lg z-50 ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden">
                      <div class="py-1">
                          <button @click="createNote('markdown')" class="group flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                              <i class="fa-solid fa-file-lines w-5 text-blue-500 mr-2"></i>筆記
                          </button>
                          <button @click="createNote('excalidraw')" class="group flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                              <i class="fa-solid fa-chalkboard w-5 text-purple-500 mr-2"></i>白板
                          </button>
                          <button @click="createNote('drawio')" class="group flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                              <i class="fa-solid fa-project-diagram w-5 text-teal-500 mr-2"></i>流程圖
                          </button>
                      </div>
                  </div>
              </div>
              <!-- Permission Button (Owner only) / Display (Non-owner) -->
              <button v-if="isOwner" @click="openInfoModal(book, 'permission', 'book')" 
                      class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer"
                      title="點擊設定權限">
                  <i class="fa-solid fa-lock text-xs"></i>
                  <span>{{ permissionOptions.find(o => o.value === permission)?.label || permission }}</span>
              </button>
              <span v-else class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm text-gray-600 dark:text-gray-400">
                  <i class="fa-solid fa-lock text-xs"></i>
                  <span>{{ permissionOptions.find(o => o.value === permission)?.label || permission }}</span>
              </span>
              <!-- Book Info Button -->
              <button @click="openInfoModal(book, 'info', 'book')" 
                      class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer"
                      title="書本設定">
                  <i class="fa-solid fa-cog text-xs"></i>
                  <span>書本設定</span>
              </button>
              <!-- Share Button -->
              <button v-if="canEdit" @click="shareBook" 
                      class="flex items-center space-x-1 bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-sm text-white transition cursor-pointer"
                      title="分享書本">
                  <i class="fa-solid fa-share-nodes text-xs"></i>
                  <span>分享</span>
              </button>
          </div>
      </div>

      <!-- Read-only Info Display -->
      <div class="mb-4 bg-white dark:bg-dark-surface p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <!-- Tags (read-only) -->
          <div class="flex items-center mb-3">
              <i class="fa-solid fa-tags text-gray-400 mr-2"></i>
              <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mr-3">標籤</span>
              <div class="flex flex-wrap gap-2">
                  <span v-for="tag in book.tags" :key="tag" class="px-3 py-1 text-sm rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                      {{ tag }}
                  </span>
                  <span v-if="!book.tags || book.tags.length === 0" class="text-gray-400 text-sm italic">無標籤</span>
              </div>
          </div>
          <!-- Description (read-only) -->
          <div class="flex items-start">
              <i class="fa-solid fa-align-left text-gray-400 mr-2 mt-1"></i>
              <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mr-3">描述</span>
              <p class="text-gray-700 dark:text-gray-300 text-sm flex-1">{{ book.description || '無描述' }}</p>
          </div>
      </div>

      <!-- Notes List -->
      <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <div ref="notesList" class="overflow-hidden rounded-t-lg">
          <div v-for="note in sortedNotes" :key="note.id" :data-id="note.id" 
               class="note-item p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center" 
               @click="openNote(note)"
               >
              <!-- Drag handle (only show if canEdit) -->
              <span v-if="canEdit" class="drag-handle cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-3 px-1" @click.stop>
                  <i class="fa-solid fa-grip-vertical"></i>
              </span>
              <!-- Note Icon and Title/Tags -->
              <div class="flex items-center flex-1 min-w-0">
                  <span class="mr-3 text-gray-400 shrink-0">
                    <i :class="[note.noteType === 'excalidraw' ? 'fas fa-chalkboard' : note.noteType === 'drawio' ? 'fas fa-project-diagram' : 'fas fa-note-sticky', note.noteType === 'excalidraw' ? 'text-purple-500' : note.noteType === 'drawio' ? 'text-teal-500' : 'text-blue-500']"></i>                    
                  </span>
                  <div class="flex-1 min-w-0">
                      <span class="font-medium text-lg text-gray-800 dark:text-gray-200 truncate block" :title="note.title">{{ note.title }}</span>
                      <!-- Tags below title -->
                      <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                          <span v-for="tag in note.tags.slice(0, 6)" :key="tag" class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                              {{ tag }}
                          </span>
                          <span v-if="note.tags.length > 6" class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400" :title="note.tags.slice(6).join(', ')">
                              +{{ note.tags.length - 6 }}
                          </span>
                      </div>
                  </div>
              </div>
              <!-- Date and Author (right side) -->
              <div class="text-right shrink-0 ml-4 text-xs text-gray-500 dark:text-gray-400">
                  <div>{{ dayjs(note.lastEditedAt || note.updatedAt).format('YYYY/MM/DD HH:mm') }}</div>
                  <div v-if="note.lastEditor || note.owner">by {{ note.lastEditor?.username || note.owner?.username }}</div>
              </div>
              <!-- Info Button -->
              <button @click.stop="openInfoModal(note, 'info', 'note')" 
                      class="ml-4 p-2 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                      title="筆記資訊">
                  <i class="fa-solid fa-circle-info"></i>
              </button>
          </div>
          <div v-if="!sortedNotes || sortedNotes.length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
              這本書裡還沒有筆記。
          </div>
          </div>
          <!-- Add Note Button at bottom -->
          <div v-if="canAddNote" class="p-4 rounded-b-lg">
            <div class="relative">
                <div class="flex shadow-sm rounded-md w-full">
                    <button @click="createNote('markdown')" class="flex-1 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-l transition flex items-center justify-center cursor-pointer border-r border-gray-200 dark:border-gray-600">
                        <i class="fa-solid fa-plus mr-2"></i>新增筆記
                    </button>
                     <button @click.stop="toggleBottomCreateMenu" class="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 rounded-r transition cursor-pointer flex items-center justify-center">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                 <!-- Dropdown Content -->
                  <div v-if="showBottomCreateMenu" class="absolute top-full left-0 mt-1 w-full bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden border border-gray-100 dark:border-gray-700">
                      <div class="py-1">
                          <button @click="createNote('markdown')" class="group flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                              <i class="fa-solid fa-file-lines w-5 text-blue-500 mr-2"></i>新增 筆記
                          </button>
                          <button @click="createNote('excalidraw')" class="group flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                              <i class="fa-solid fa-chalkboard w-5 text-purple-500 mr-2"></i>新增 白板
                          </button>
                          <button @click="createNote('drawio')" class="group flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left">
                              <i class="fa-solid fa-project-diagram w-5 text-teal-500 mr-2"></i>新增 流程圖
                          </button>
                      </div>
                  </div>
            </div>
          </div>
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="flex items-center justify-center h-full">
      <div class="text-center">
        <i class="fa-solid fa-book-skull text-6xl text-gray-300 mb-4"></i>
        <p class="text-gray-500">找不到此書本或沒有權限</p>
        <router-link to="/" class="mt-4 inline-block text-blue-500 hover:underline">回首頁</router-link>
      </div>
    </div>
  </div>
  <InfoModal
    :show="showInfoModal"
    :type="infoModalType"
    :item="infoModalItem"
    :tab="infoModalTab"
    :editable-description="editableDescription"
    :editable-tags="editableTags"
    :new-tag-input="newTag"
    :editable-permission="editablePermission"
    :comments-enabled="infoCommentsEnabled"
    :books="availableBooks"
    @close="showInfoModal = false"
    @move-note="handleMoveNoteFromInfo"
    @update:tab="infoModalTab = $event"
    @update:title="handleTitleUpdate"
    @update:description="autoSaveBookDescription"
    @update:newTag="newTag = $event"
    @add-tag="addEditableTag"
    @remove-tag="removeEditableTag"
    @update:permission="autoSavePermission"
    @update:commentsEnabled="autoSaveCommentsEnabled"
    @update:isPublic="autoSaveIsPublic"
    @update:shareId="handleShareIdUpdate"
    @update:shareAlias="handleShareAliasUpdate"
  />
</template>
```
