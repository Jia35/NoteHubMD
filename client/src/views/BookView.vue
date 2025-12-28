<script setup>
import { ref, computed, onMounted, onUnmounted, inject, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { NoteCard, InfoModal } from '@/components'

const route = useRoute()
const router = useRouter()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// Book data
const book = ref(null)
const loading = ref(true)
const permission = ref('private')
const isOwner = ref(false)
const canEdit = ref(false)
const canAddNote = ref(false)

// Inject global sidebar data from App.vue
const user = inject('sidebarUser')
const sidebarBooks = inject('sidebarBooks')
const pinnedItems = inject('sidebarPinnedItems')
const loadSidebarData = inject('loadSidebarData')
const updateSidebarBooks = inject('updateSidebarBooks')
const updateSidebarPinnedItems = inject('updateSidebarPinnedItems')

const currentRoute = computed(() => route.path)

// Display mode
const displayMode = ref(localStorage.getItem('NoteHubMD-bookDisplayMode') || 'list')

// Menu state
const openMenuId = ref(null)

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
  { value: 'private', label: '私人' },
  { value: 'public', label: '公開' },
  { value: 'shared', label: '共享' }
]

const permissionLabel = computed(() => {
  const opt = permissionOptions.find(o => o.value === permission.value)
  return opt?.label || permission.value
})

// Check if item is pinned
const isPinned = (type, id) => {
  return pinnedItems?.value?.some(p => p.type === type && p.id === id) || false
}

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

// Create note in book
const createNote = async () => {
  if (!book.value) return
  try {
    const note = await api.createNoteInBook(book.value.id)
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

// Close menu
const closeMenu = () => {
  openMenuId.value = null
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
  editableDescription.value = book.value.description || ''
  editableTags.value = book.value.tags ? [...book.value.tags] : []
  editablePermission.value = book.value.permission || 'private'
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

// Add tag to book
const addEditableTag = async (tagArg) => {
  const tag = tagArg || newTag.value?.trim()
  if (!tag || editableTags.value.includes(tag)) return
  editableTags.value.push(tag)
  newTag.value = ''
  try {
    await api.updateBook(book.value.id, { tags: editableTags.value })
    book.value.tags = [...editableTags.value]
  } catch (e) {
    showAlert?.('新增標籤失敗', 'error')
    editableTags.value = editableTags.value.filter(t => t !== tag)
  }
}

// Remove tag from book
const removeEditableTag = async (tag) => {
  const prevTags = [...editableTags.value]
  editableTags.value = editableTags.value.filter(t => t !== tag)
  try {
    await api.updateBook(book.value.id, { tags: editableTags.value })
    book.value.tags = [...editableTags.value]
  } catch (e) {
    showAlert?.('移除標籤失敗', 'error')
    editableTags.value = prevTags
  }
}

// Share book
const shareBook = () => {
  if (!book.value?.shareId) {
    showAlert?.('此書本沒有分享連結', 'error')
    return
  }
  const shareUrl = `${window.location.origin}/v/${book.value.shareId}`
  navigator.clipboard.writeText(shareUrl).then(() => {
    showAlert?.('分享連結已複製到剪貼簿', 'success')
  }).catch(() => {
    showAlert?.('複製失敗，請手動複製：' + shareUrl, 'info')
  })
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
      await api.updatePermission(infoModalItem.value.id, newPermission)
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
const autoSaveIsPublic = async (isPublic) => {
  if (!infoModalItem.value) return
  try {
    await api.updateNote(infoModalItem.value.id, { isPublic })
    const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
    if (note) note.isPublic = isPublic
  } catch (e) {
    showAlert?.('更新失敗', 'error')
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

const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id))
  } catch (e) {
    showAlert?.('取消釘選失敗', 'error')
  }
}

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
      <!-- Header -->
      <div class="mb-6">
        <!-- Breadcrumb -->
        <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
          <router-link to="/" class="hover:text-blue-500">Home</router-link>
          <span class="mx-2">/</span>
          <span class="text-gray-800 dark:text-white font-medium truncate max-w-xs">{{ book.title }}</span>
        </div>

        <div class="flex justify-between items-start">
          <div>
            <h1 class="text-3xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-3">
              <i class="fa-solid fa-book text-blue-600"></i>
              {{ book.title }}
              <span v-if="!isOwner && permission === 'private'" class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded ml-2">Private</span>
              <span v-if="permission === 'public'" class="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded ml-2">Public</span>
            </h1>
            <p v-if="book.description" class="text-gray-600 dark:text-gray-400 mb-2 max-w-2xl">{{ book.description }}</p>
            
            <div class="flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span v-if="book.tags && book.tags.length > 0" class="flex items-center gap-2 mr-4">
                <i class="fa-solid fa-tags"></i>
                <span v-for="tag in book.tags" :key="tag" class="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
                  {{ tag }}
                </span>
              </span>
              <span class="mr-4"><i class="fa-regular fa-clock mr-1"></i>更新於 {{ formatDate(book.updatedAt) }}</span>
              <span v-if="book.User"><i class="fa-regular fa-user mr-1"></i>{{ book.User.name || book.User.username }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3">
            <button @click="openInfoModal('info')" 
                    class="flex items-center space-x-1 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 px-3 py-1.5 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer shadow-sm">
              <i class="fa-solid fa-cog"></i>
              <span>書本設定</span>
            </button>
            <button v-if="canEdit" @click="openInfoModal('share')"
                    class="flex items-center space-x-1 bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded text-sm text-white transition cursor-pointer shadow-sm"
                    title="分享書本">
              <i class="fa-solid fa-share-nodes"></i>
              <span>分享</span>
            </button>
            
            <!-- Book Display Mode -->
            <div class="flex bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-300 dark:border-gray-700 p-0.5">
              <button @click="displayMode = 'grid'; saveDisplayMode()" 
                      class="px-2 py-1 rounded transition text-sm cursor-pointer"
                      :class="displayMode === 'grid' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'">
                <i class="fa-solid fa-border-all"></i>
              </button>
              <button @click="displayMode = 'list'; saveDisplayMode()" 
                      class="px-2 py-1 rounded transition text-sm cursor-pointer"
                      :class="displayMode === 'list' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'">
                <i class="fa-solid fa-list"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Note (if owner or can edit) -->
      <div v-if="canAddNote" class="mb-6">
        <button @click="createNoteInBook" class="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition flex items-center justify-center gap-2 font-medium cursor-pointer">
          <i class="fa-solid fa-plus-circle"></i>
          在本書中新增筆記
        </button>
      </div>

      <!-- Notes Grid/List -->
      <div v-if="sortedNotes.length > 0" :class="displayMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'flex flex-col gap-2'">
        <div v-for="note in sortedNotes" :key="note.id" 
             class="group relative"
             :draggable="isOwner || canEdit"
             @dragstart="onDragStart($event, note)"
             @dragover.prevent
             @drop="onDrop($event, note)">
             
          <NoteCard 
            :note="note" 
            :display-mode="displayMode"
            :show-book-info="false"
            @delete="confirmDeleteNote"
            @move="openMoveNoteModal"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 text-2xl">
          <i class="fa-solid fa-book-open"></i>
        </div>
        <h3 class="text-lg font-medium text-gray-800 dark:text-white mb-2">這本書還沒有筆記</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">開始記錄你的想法吧！</p>
        <button v-if="canAddNote" @click="createNoteInBook" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">
          <i class="fa-solid fa-plus mr-2"></i>新增筆記
        </button>
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
    @update:description="autoSaveBookDescription"
    @update:newTag="newTag = $event"
    @add-tag="addEditableTag"
    @remove-tag="removeEditableTag"
    @update:permission="autoSavePermission"
    @update:commentsEnabled="autoSaveCommentsEnabled"
    @update:isPublic="autoSaveIsPublic"
  />
</template>
```
