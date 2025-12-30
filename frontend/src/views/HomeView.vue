<script setup>
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { BookCard, NoteCard, InfoModal } from '@/components'


const route = useRoute()
const router = useRouter()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// Inject global sidebar data from App.vue
const user = inject('sidebarUser')
const books = inject('sidebarBooks')
// [DISABLED] 釘選功能暫時停用
// const pinnedItems = inject('sidebarPinnedItems')
const loadSidebarData = inject('loadSidebarData')
const updateSidebarBooks = inject('updateSidebarBooks')
const updateSidebarUser = inject('updateSidebarUser')
// [DISABLED] 釘選功能暫時停用
// const updateSidebarPinnedItems = inject('updateSidebarPinnedItems')

// Inject global view mode from App.vue
const globalViewMode = inject('globalViewMode')

// Inject global actions
const openCreateBookModal = inject('openCreateBookModal')

// Local state
const loading = ref(true)
const notes = ref([])

// Check if on uncategorized page
const isUncategorizedPage = computed(() => route.path === '/uncategorized')

// Check if on books list page
const isBookListPage = computed(() => route.path === '/books')

// Display books (not in trash)
const displayBooks = computed(() => {
  const filtered = books.value.filter(b => !b.deletedAt)
  if (globalViewMode.value === 'my') {
    return filtered.filter(b => b.isOwner)
  } else {
    return filtered.filter(b => b.isPublic)
  }
})

// Sorted books
const sortedBooks = computed(() => {
  return [...displayBooks.value].sort((a, b) => {
    let aVal, bVal
    if (sortBy.value === 'title') {
      aVal = (a.title || '').toLowerCase()
      bVal = (b.title || '').toLowerCase()
      return sortOrder.value === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    } else {
      aVal = new Date(a[sortBy.value] || 0).getTime()
      bVal = new Date(b[sortBy.value] || 0).getTime()
      return sortOrder.value === 'asc' ? aVal - bVal : bVal - aVal
    }
  })
})

// Display notes (uncategorized, not in trash)
const displayNotes = computed(() => {
  const filtered = notes.value.filter(n => !n.deletedAt && !n.bookId)
  if (globalViewMode.value === 'my') {
    return filtered.filter(n => n.isOwner)
  } else {
    return filtered.filter(n => n.isPublic)
  }
})

// Notes sorting and display
const sortBy = ref(localStorage.getItem('NoteHubMD-sortBy') || 'updatedAt')
const sortOrder = ref(localStorage.getItem('NoteHubMD-sortOrder') || 'desc')
const displayMode = ref(localStorage.getItem('NoteHubMD-displayMode') || 'grid')
const currentPage = ref(1)
const pageSize = 20

const sortOptions = [
  { value: 'updatedAt', label: '更新時間' },
  { value: 'createdAt', label: '建立時間' },
  { value: 'title', label: '標題' }
]

// Sorted notes
const sortedNotes = computed(() => {
  const sorted = [...displayNotes.value].sort((a, b) => {
    let aVal, bVal
    if (sortBy.value === 'title') {
      aVal = (a.title || '').toLowerCase()
      bVal = (b.title || '').toLowerCase()
      return sortOrder.value === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    } else {
      aVal = new Date(a[sortBy.value] || 0).getTime()
      bVal = new Date(b[sortBy.value] || 0).getTime()
      return sortOrder.value === 'asc' ? aVal - bVal : bVal - aVal
    }
  })
  return sorted
})

// Paginated notes
const paginatedNotes = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return sortedNotes.value.slice(start, start + pageSize)
})

// Uncategorized notes count (for /books page display)
const uncategorizedCount = computed(() => displayNotes.value.length)

const totalPages = computed(() => Math.ceil(sortedNotes.value.length / pageSize))

// Save preferences
const setSortBy = (value) => {
  sortBy.value = value
  currentPage.value = 1
  localStorage.setItem('NoteHubMD-sortBy', value)
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  currentPage.value = 1
  localStorage.setItem('NoteHubMD-sortOrder', sortOrder.value)
}

const setDisplayMode = (mode) => {
  displayMode.value = mode
  localStorage.setItem('NoteHubMD-displayMode', mode)
}

// Menu state
const openMenuId = ref(null)

// Settings Modal
const showSettings = ref(false)
// Modals are managed by App.vue (Settings, Profile, CreateBook)

// Info Modal State
const showInfoModal = ref(false)
const infoModalType = ref('') // 'book' or 'note'
const infoModalItem = ref({})
const infoModalTab = ref('info') // 'info', 'permission', 'share'
const editableDescription = ref('')
const editableTags = ref([])
const newTag = ref('')
const infoCommentsEnabled = ref(true)

// User permissions state for Info Modal
const infoUserPermissions = ref([])
const infoUserSearchQuery = ref('')
const infoUserSearchResults = ref([])
const infoNewUserPermission = ref('edit')
const infoLoadingUserPermissions = ref(false)

// Export/Import Notes logic moved to App.vue

// About Modal
const showAboutModal = ref(false)

// Info modal functions
const editablePermission = ref('private')

const openInfoModal = (type, item, tab = 'info') => {
  infoModalType.value = type
  infoModalItem.value = { ...item }
  editableDescription.value = item.description || ''
  editableTags.value = [...(item.tags || [])]
  editablePermission.value = item.permission || 'private'
  infoCommentsEnabled.value = !item.commentsDisabled
  infoModalTab.value = tab
  showInfoModal.value = true
  openMenuId.value = null
}

const addEditableTag = async (tag) => {
  if (!tag) return
  if (editableTags.value.includes(tag)) {
    return
  }
  editableTags.value.push(tag)
  await autoSaveTags()
}

const removeEditableTag = async (tagToRemove) => {
  editableTags.value = editableTags.value.filter(t => t !== tagToRemove)
  await autoSaveTags()
}

// Auto-save functions
const autoSaveTags = async () => {
  try {
    if (infoModalType.value === 'book') {
      await api.updateBook(infoModalItem.value.id, { tags: editableTags.value })
      const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id)
      if (bookIndex !== -1) books.value[bookIndex].tags = [...editableTags.value]
    } else {
      await api.updateNote(infoModalItem.value.id, { tags: editableTags.value })
      const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id)
      if (noteIndex !== -1) notes.value[noteIndex].tags = [...editableTags.value]
    }
  } catch (e) {
    showAlert?.('標籤儲存失敗', 'error')
  }
}

const autoSaveTitle = async (newTitle) => {
  infoModalItem.value.title = newTitle
  if (infoModalType.value !== 'book' || !infoModalItem.value.canEdit) return
  try {
    await api.updateBook(infoModalItem.value.id, { title: newTitle })
    const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id)
    if (bookIndex !== -1) books.value[bookIndex].title = newTitle
  } catch (e) {
    showAlert?.('標題儲存失敗', 'error')
  }
}

const autoSaveDescription = async (newDesc) => {
  editableDescription.value = newDesc
  if (infoModalType.value !== 'book' || !infoModalItem.value.canEdit) return
  try {
    await api.updateBook(infoModalItem.value.id, { description: newDesc })
    const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id)
    if (bookIndex !== -1) books.value[bookIndex].description = newDesc
  } catch (e) {
    showAlert?.('描述儲存失敗', 'error')
  }
}

const autoSavePermission = async (newPermission) => {
  editablePermission.value = newPermission
  if (!infoModalItem.value.isOwner) return
  try {
    if (infoModalType.value === 'book') {
      await api.updateBookPermission(infoModalItem.value.id, newPermission)
      const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id)
      if (bookIndex !== -1) books.value[bookIndex].permission = newPermission
    } else {
      await api.updatePermission(infoModalItem.value.id, newPermission)
      const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id)
      if (noteIndex !== -1) notes.value[noteIndex].permission = newPermission
    }
  } catch (e) {
    showAlert?.('權限儲存失敗', 'error')
  }
}

const autoSaveCommentsEnabled = async (enabled) => {
  infoCommentsEnabled.value = enabled
  if (infoModalType.value !== 'note' || !infoModalItem.value.isOwner) return
  try {
    await api.updateNote(infoModalItem.value.id, { commentsDisabled: !enabled })
    const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id)
    if (noteIndex !== -1) notes.value[noteIndex].commentsDisabled = !enabled
  } catch (e) {
    showAlert?.('留言設定儲存失敗', 'error')
  }
}

const autoSaveIsPublic = async (isPublic) => {
  infoModalItem.value.isPublic = isPublic
  if (!infoModalItem.value.isOwner) return
  try {
    if (infoModalType.value === 'book') {
      await api.updateBook(infoModalItem.value.id, { isPublic })
      const bookIndex = books.value.findIndex(b => b.id === infoModalItem.value.id)
      if (bookIndex !== -1) books.value[bookIndex].isPublic = isPublic
    } else {
      await api.updateNote(infoModalItem.value.id, { isPublic })
      const noteIndex = notes.value.findIndex(n => n.id === infoModalItem.value.id)
      if (noteIndex !== -1) notes.value[noteIndex].isPublic = isPublic
    }
  } catch (e) {
    showAlert?.('公開設定儲存失敗', 'error')
  }
}

// Move Note
const handleMoveNote = async (bookId) => {
  try {
    const noteId = infoModalItem.value.id
    await api.updateNote(noteId, { bookId: bookId || null })
    showAlert?.('移動成功', 'success')
    showInfoModal.value = false
    loadData()
  } catch (e) {
    showAlert?.('移動失敗', 'error')
  }
}

// Load data (notes only - sidebar data is managed by App.vue)
const loadData = async () => {
  loading.value = true
  try {
    // Load sidebar data if not already loaded
    await loadSidebarData()
    
    // Load notes (local to this view)
    const notesData = await api.getNotes()
    notes.value = notesData
  } catch (e) {
    console.error('Failed to load data:', e)
  } finally {
    loading.value = false
  }
}

// Refresh books data (called after book operations)
const refreshBooks = async () => {
  try {
    const booksData = await api.getBooks()
    updateSidebarBooks(booksData)
  } catch (e) {
    console.error('Failed to refresh books:', e)
  }
}

// Set view mode
const setGlobalViewMode = (mode) => {
  globalViewMode.value = mode
  localStorage.setItem('NoteHubMD-viewMode', mode)
}

// Set theme
// Functions for global modals are injected or handled by App.vue

// Create note
const createNote = async () => {
  try {
    const note = await api.createNote()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert?.('建立筆記失敗', 'error')
  }
}

// Create Book logic moved to App.vue

// Open note
const openNote = (note) => {
  window.location.href = '/n/' + note.id
}

// Open book
const openBook = (book) => {
  router.push('/b/' + book.id)
}

// Toggle menu
const toggleMenu = (id) => {
  openMenuId.value = openMenuId.value === id ? null : id
}

// Close menu on click outside
const closeMenu = () => {
  openMenuId.value = null
}

/* [DISABLED] 釘選功能暫時停用
// Unpin item
const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === id))
  } catch (e) {
    showAlert?.('取消釘選失敗', 'error')
  }
}

// Toggle pin
const togglePin = async (type, item) => {
  const isPinned = pinnedItems.value.some(p => p.type === type && p.id === item.id)
  try {
    if (isPinned) {
      await api.removePin(type, item.id)
      pinnedItems.value = pinnedItems.value.filter(p => !(p.type === type && p.id === item.id))
    } else {
      await api.addPin(type, item.id)
      pinnedItems.value.push({ type, id: item.id, title: item.title })
    }
    closeMenu()
  } catch (e) {
    showAlert?.('操作失敗', 'error')
  }
}
*/

// Delete book
const deleteBook = async (book) => {
  const confirmed = await showConfirm?.(`確定要刪除「${book.title}」嗎？`, '刪除確認')
  if (!confirmed) return
  try {
    await api.deleteBook(book.id)
    books.value = books.value.filter(b => b.id !== book.id)
    closeMenu()
  } catch (e) {
    showAlert?.('刪除失敗', 'error')
  }
}

// Delete note
const deleteNote = async (note) => {
  const confirmed = await showConfirm?.(`確定要刪除「${note.title || 'Untitled'}」嗎？`, '刪除確認')
  if (!confirmed) return
  try {
    await api.deleteNote(note.id)
    notes.value = notes.value.filter(n => n.id !== note.id)
    closeMenu()
  } catch (e) {
    showAlert?.('刪除失敗', 'error')
  }
}

/* [DISABLED] 釘選功能暫時停用
// Check if item is pinned
// const isPinned = (type, id) => {
//   return pinnedItems.value.some(p => p.type === type && p.id === id)
// }
*/
// Stub function to avoid template errors
const isPinned = () => false

// Profile & Cropper functions removed (moved to UserProfileModal)

// Logout
const logout = async () => {
  await api.logout()
  window.location.href = '/login'
}

// Export/Import functions moved to App.vue

// Watch for route changes to reload data when navigating between pages
// that share the same component (/, /books, /uncategorized)
watch(() => route.path, (newPath, oldPath) => {
  if (newPath !== oldPath) {
    // Reset pagination when route changes
    currentPage.value = 1
    // Reload data for the new route
    loadData()
  }
})

// Handle click outside to close menu
onMounted(() => {
  loadData()
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})
</script>

<template>
  <div class="px-8 py-5 container mx-auto">
    <!-- Header for Home page -->
    <template v-if="!isUncategorizedPage && !isBookListPage">
        <div class="mb-4 flex items-center text-gray-500 dark:text-gray-400">
            <span>Home</span>
        </div>
        
        <div class="mb-6 flex flex-wrap gap-4 items-center justify-end">
            <div class="flex items-center gap-2 ml-auto">
                <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-sort mr-1"></i>排序：</span>
                <select v-model="sortBy" @change="saveSortSettings"
                        class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
                <button @click="toggleSortOrder"
                        class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        :title="sortOrder === 'asc' ? '升冪' : '降冪'">
                    <i class="fa-solid" :class="sortOrder === 'asc' ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short'"></i>
                </button>
            </div>
        </div>
    </template>

    <!-- Header for Books List page -->
    <template v-else-if="isBookListPage">
        <div class="mb-4 flex items-center text-gray-500 dark:text-gray-400">
            <router-link to="/" class="hover:text-blue-500">Home</router-link>
            <span class="mx-2">/</span>
            <span>全部書本</span>
        </div>

        <div class="mb-6 flex flex-wrap gap-4 items-center justify-between">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">
                <i class="fa-solid fa-book mr-2"></i>全部書本
            </h1>
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-sort mr-1"></i>排序：</span>
                <select v-model="sortBy" @change="saveSortSettings"
                        class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
                <button @click="toggleSortOrder"
                        class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        :title="sortOrder === 'asc' ? '升冪' : '降冪'">
                    <i class="fa-solid" :class="sortOrder === 'asc' ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short'"></i>
                </button>
                
                <div class="border-l border-gray-300 dark:border-gray-600 h-6 mx-2"></div>

                <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 text-sm">
                    <button type="button" @click="displayMode = 'grid'; saveDisplayMode()"
                        :class="{'bg-white dark:bg-gray-600 text-blue-500 shadow-sm': displayMode === 'grid', 'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300': displayMode !== 'grid'}"
                        class="px-2 py-1 rounded transition" title="格狀顯示">
                        <i class="fa-solid fa-border-all pointer-events-none"></i>
                    </button>
                    <button type="button" @click="displayMode = 'list'; saveDisplayMode()"
                        :class="{'bg-white dark:bg-gray-600 text-blue-500 shadow-sm': displayMode === 'list', 'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300': displayMode !== 'list'}"
                        class="px-2 py-1 rounded transition" title="清單顯示">
                        <i class="fa-solid fa-list pointer-events-none"></i>
                    </button>
                </div>
            </div>
        </div>
    </template>

    <!-- Header for Uncategorized page -->
    <template v-else>
        <div class="mb-4 flex items-center text-gray-500 dark:text-gray-400">
            <router-link to="/" class="hover:text-blue-500">Home</router-link>
            <span class="mx-2">/</span>
            <span>未分類筆記</span>
        </div>

        <div class="mb-6 flex flex-wrap gap-4 items-center justify-between">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white">
                <i class="fa-solid fa-inbox mr-2"></i>未分類筆記
            </h1>
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-sort mr-1"></i>排序：</span>
                <select v-model="sortBy" @change="saveSortSettings"
                        class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
                <button @click="toggleSortOrder"
                        class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                        :title="sortOrder === 'asc' ? '升冪' : '降冪'">
                    <i class="fa-solid" :class="sortOrder === 'asc' ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short'"></i>
                </button>
                
                <div class="border-l border-gray-300 dark:border-gray-600 h-6 mx-2"></div>

                <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 text-sm">
                    <button type="button" @click="displayMode = 'grid'; saveDisplayMode()"
                        :class="{'bg-white dark:bg-gray-600 text-blue-500 shadow-sm': displayMode === 'grid', 'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300': displayMode !== 'grid'}"
                        class="px-2 py-1 rounded transition" title="格狀顯示">
                        <i class="fa-solid fa-border-all pointer-events-none"></i>
                    </button>
                    <button type="button" @click="displayMode = 'list'; saveDisplayMode()"
                        :class="{'bg-white dark:bg-gray-600 text-blue-500 shadow-sm': displayMode === 'list', 'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300': displayMode !== 'list'}"
                        class="px-2 py-1 rounded transition" title="清單顯示">
                        <i class="fa-solid fa-list pointer-events-none"></i>
                    </button>
                </div>
            </div>
        </div>
    </template>
    <div>
      <!-- Books Section (not shown on uncategorized page) -->
      <!-- On /books page, show based on displayMode; on home page, show as horizontal scroll -->
      <section v-if="!isUncategorizedPage" class="mb-6">
        <h2 v-if="!isBookListPage" class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">Books</h2>
        
        <!-- Books Grid/List for /books page -->
        <template v-if="isBookListPage">
          <!-- Empty State - Grid Mode -->
          <div v-if="sortedBooks.length === 0 && displayMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div
              @click="openCreateBookModal"
              class="flex flex-col items-center justify-center bg-white dark:bg-dark-surface rounded-lg shadow hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-xl transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 h-[140px]"
            >
              <i class="fa-solid fa-plus text-3xl text-green-500 mb-2"></i>
              <p class="text-gray-600 dark:text-gray-300 font-medium">新增書本</p>
            </div>
          </div>

          <!-- Empty State - List Mode -->
          <div v-else-if="sortedBooks.length === 0 && displayMode === 'list'" class="flex flex-col gap-2">
            <div
              @click="openCreateBookModal"
              class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 h-[70px]"
            >
              <div class="w-10 text-center text-xl mr-3 text-green-500 flex-shrink-0">
                <i class="fa-solid fa-plus"></i>
              </div>
              <p class="text-gray-600 dark:text-gray-300 font-medium">新增書本</p>
            </div>
          </div>

          <!-- Grid View -->
          <div v-else-if="displayMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <!-- Uncategorized Notes Card (always first) -->
            <router-link to="/uncategorized" 
                class="w-auto group relative bg-white dark:bg-dark-surface p-6 rounded-lg shadow hover:shadow-xl cursor-pointer transition border border-gray-200 dark:border-gray-700">
                <div class="flex items-center mb-1">
                    <span class="w-6 mr-2 text-center shrink-0 text-lg"><i class="fa-solid fa-inbox text-gray-500"></i></span>
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white truncate">未分類筆記 ({{ uncategorizedCount }})</h3>
                </div>
                <div class="mb-2">
                    <p class="text-gray-500 dark:text-gray-400 text-sm">不屬於任何書本的筆記</p>
                </div>
            </router-link>
            <BookCard
              v-for="book in sortedBooks"
              :key="book.id"
              :book="book"
              mode="grid"
              :in-grid="true"
              :show-menu="openMenuId === 'book-' + book.id"
              :is-pinned="isPinned('book', book.id)"
              @click="openBook(book)"
              @toggle-menu="toggleMenu('book-' + book.id)"
              @open-info="openInfoModal('book', book)"
              @toggle-pin="togglePin('book', book)"
              @delete="deleteBook(book)"
            />
          </div>

          <!-- List View -->
          <div v-else class="flex flex-col gap-2">
            <!-- Uncategorized Notes Card (always first) -->
            <router-link to="/uncategorized" 
                class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border border-gray-100 dark:border-gray-700 transition group relative h-[70px]">
                <div class="w-10 text-center text-xl mr-3 text-gray-500 flex-shrink-0">
                    <i class="fa-solid fa-inbox"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-gray-800 dark:text-white truncate text-base mb-1">未分類筆記 ({{ uncategorizedCount }})</h3>
                    <div class="h-[20px] overflow-hidden">
                        <p class="text-gray-500 dark:text-gray-400 text-xs">不屬於任何書本的筆記</p>
                    </div>
                </div>
            </router-link>
            <BookCard
              v-for="book in sortedBooks"
              :key="book.id"
              :book="book"
              mode="list"
              :show-menu="openMenuId === 'book-' + book.id"
              :is-pinned="isPinned('book', book.id)"
              @click="openBook(book)"
              @toggle-menu="toggleMenu('book-' + book.id)"
              @open-info="openInfoModal('book', book)"
              @toggle-pin="togglePin('book', book)"
              @delete="deleteBook(book)"
            />
          </div>
        </template>
        
        <!-- Books Horizontal Scroll for home page -->
        <div v-else class="flex gap-4 pb-4" style="overflow-x: auto;">
          <!-- Empty State -->
          <div
            v-if="sortedBooks.length === 0"
            @click="openCreateBookModal"
            class="w-64 shrink-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 p-6"
          >
            <i class="fa-solid fa-plus text-3xl text-green-500 mb-3"></i>
            <p class="text-gray-600 dark:text-gray-300 font-medium">新增書本</p>
          </div>
          <!-- Book Cards -->
          <BookCard
            v-for="book in sortedBooks"
            :key="book.id"
            :book="book"
            :show-menu="openMenuId === 'book-' + book.id"
            :is-pinned="isPinned('book', book.id)"
            @click="openBook(book)"
            @toggle-menu="toggleMenu('book-' + book.id)"
            @open-info="openInfoModal('book', book)"
            @toggle-pin="togglePin('book', book)"
            @delete="deleteBook(book)"
          />
        </div>
      </section>

      <!-- Notes Section (not shown on /books page) -->
      <section v-if="!isBookListPage">
        <div v-if="!isUncategorizedPage" class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
                <h2 class="text-lg font-bold text-gray-700 dark:text-gray-300">Notes</h2>
            </div>
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 text-sm">
                <button type="button" @click="displayMode = 'grid'; saveDisplayMode()"
                    :class="{'bg-white dark:bg-gray-600 text-blue-500 shadow-sm': displayMode === 'grid', 'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300': displayMode !== 'grid'}"
                    class="px-2 py-1 rounded transition" title="格狀顯示">
                    <i class="fa-solid fa-border-all pointer-events-none"></i>
                </button>
                <button type="button" @click="displayMode = 'list'; saveDisplayMode()"
                    :class="{'bg-white dark:bg-gray-600 text-blue-500 shadow-sm': displayMode === 'list', 'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300': displayMode !== 'list'}"
                    class="px-2 py-1 rounded transition" title="清單顯示">
                    <i class="fa-solid fa-list pointer-events-none"></i>
                </button>
            </div>
        </div>

        <!-- Empty State - Grid Mode -->
        <div v-if="sortedNotes.length === 0 && displayMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
              @click="createNote"
              class="flex flex-col items-center justify-center bg-white dark:bg-dark-surface rounded-lg shadow hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-xl transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 h-[140px]">
            <i class="fa-solid fa-plus text-3xl text-blue-500 mb-2"></i>
            <p class="text-gray-600 dark:text-gray-300 font-medium">新增筆記</p>
          </div>
        </div>

        <!-- Empty State - List Mode -->
        <div v-else-if="sortedNotes.length === 0 && displayMode === 'list'" class="flex flex-col gap-2">
          <div
              @click="createNote"
              class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 h-[70px]">
            <div class="w-10 text-center text-xl mr-3 text-blue-500 flex-shrink-0">
              <i class="fa-solid fa-plus"></i>
            </div>
            <p class="text-gray-600 dark:text-gray-300 font-medium">新增筆記</p>
          </div>
        </div>

        <!-- Grid View -->
        <div v-else-if="displayMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <NoteCard
            v-for="note in paginatedNotes"
            :key="note.id"
            :note="note"
            mode="grid"
            :show-menu="openMenuId === 'note-' + note.id"
            :is-pinned="isPinned('note', note.id)"
            @click="openNote(note)"
            @toggle-menu="toggleMenu('note-' + note.id)"
            @open-info="openInfoModal('note', note)"
            @open-move="openInfoModal('note', note, 'info')"
            @toggle-pin="togglePin('note', note)"
            @delete="deleteNote(note)"
          />
        </div>

        <!-- List View -->
        <div v-else class="flex flex-col gap-2">
          <NoteCard
            v-for="note in paginatedNotes"
            :key="note.id"
            :note="note"
            mode="list"
            :show-menu="openMenuId === 'note-' + note.id"
            :is-pinned="isPinned('note', note.id)"
            @click="openNote(note)"
            @toggle-menu="toggleMenu('note-' + note.id)"
            @open-info="openInfoModal('note', note)"
            @open-move="openInfoModal('note', note, 'info')"
            @toggle-pin="togglePin('note', note)"
            @delete="deleteNote(note)"
          />
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex justify-center items-center gap-2 mt-6">
          <button @click="currentPage = currentPage - 1" :disabled="currentPage <= 1"
                  class="px-3 py-1 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <span class="text-sm text-gray-600 dark:text-gray-400">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="currentPage = currentPage + 1" :disabled="currentPage >= totalPages"
                  class="px-3 py-1 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </section>
    </div>

    <!-- Info Modal -->
    <Teleport to="body">
      <InfoModal
        :show="showInfoModal"
        :type="infoModalType"
        :item="infoModalItem"
        :tab="infoModalTab"
        @update:tab="infoModalTab = $event"
        :user="user"
        :user-permissions="infoUserPermissions"
        :user-search-results="infoUserSearchResults"
        :loading-user-permissions="infoLoadingUserPermissions"
        @close="showInfoModal = false"
        @update:title="autoSaveTitle"
        @update:description="autoSaveDescription"
        @update:permission="autoSavePermission"
        @update:commentsEnabled="autoSaveCommentsEnabled"
        @update:isPublic="autoSaveIsPublic"
        @add-tag="addEditableTag"
        @remove-tag="removeEditableTag"
        @move-note="handleMoveNote"
      />
    </Teleport>
  </div>
</template>
