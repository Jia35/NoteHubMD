<script setup>
import { ref, computed, onMounted, onUnmounted, inject, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { SidebarNav, NoteCard, InfoModal } from '@/components'

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

// User & Sidebar state
const user = ref(null)
const sidebarBooks = ref([])
const pinnedItems = ref([])
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')
const currentRoute = computed(() => route.path)
const showSettings = ref(false)
const showUserProfileModal = ref(false)
const showCreateBookModal = ref(false)

// Filtered sidebar books
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return sidebarBooks.value.filter(b => b.isOwner)
  }
  return sidebarBooks.value.filter(b => b.isPublic)
})
const limitedSidebarBooks = computed(() => filteredSidebarBooks.value.slice(0, 20))
const hasMoreBooks = computed(() => filteredSidebarBooks.value.length > 20)

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
  // TODO: implement pinned items check
  return false
}

// Load book data
const loadBook = async () => {
  loading.value = true
  try {
    // Load user and sidebar data
    const [userData, booksData, pinnedData] = await Promise.all([
      api.getMe().catch(() => null),
      api.getBooks(),
      api.getPinnedItems().catch(() => [])
    ])
    user.value = userData
    sidebarBooks.value = booksData
    pinnedItems.value = pinnedData
    allBooks.value = booksData

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

// Open info modal
// Open info modal
const openInfoModal = (item, tab = 'info', typeOverride = null) => {
  // Determine if item is a book or note
  const isBook = typeOverride === 'book' || (!typeOverride && item.notes !== undefined)
  infoModalType.value = isBook ? 'book' : 'note'
  
  if (isBook) {
    // Set book-specific editable fields
    editableDescription.value = item.description || ''
    editableTags.value = [...(item.tags || [])]
    newTag.value = ''
  }
  
  infoModalItem.value = item
  editablePermission.value = item.permission || 'inherit'
  infoCommentsEnabled.value = item.commentsEnabled !== false
  infoModalTab.value = tab
  showInfoModal.value = true
  closeMenu()
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
    await api.updateNotePermission(infoModalItem.value.id, newPermission)
    const note = book.value.notes.find(n => n.id === infoModalItem.value.id)
    if (note) note.permission = newPermission
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
  <div class="h-full flex bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text">
    <!-- Sidebar -->
    <SidebarNav
      :user="user"
      :books="limitedSidebarBooks"
      :pinned-items="pinnedItems"
      :show-pinned="true"
      :show-more-books="hasMoreBooks"
      :current-route="currentRoute"
      :global-view-mode="globalViewMode"
      @unpin="unpinItem"
      @view-mode-change="setGlobalViewMode"
      @create-note="createSidebarNote"
      @create-book="showCreateBookModal = true"
      @open-profile="showUserProfileModal = true"
      @open-settings="showSettings = true"
    />

    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="px-8 py-5 container mx-auto">
        <!-- Breadcrumb -->
        <div class="mb-4 flex items-center text-gray-500 dark:text-gray-400">
          <router-link to="/" class="hover:text-blue-500">Home</router-link>
          <span class="mx-2">/</span>
          <span>{{ book?.title || 'Loading...' }}</span>
        </div>

        <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
    </div>

    <!-- Book Content -->
    <template v-else-if="book">
      <!-- Book Header -->
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
          <span class="mr-3"><i class="fa-solid fa-book"></i></span> {{ book.title }}
        </h1>
        <div class="flex items-center gap-3">
          <button v-if="canAddNote" @click="createNote"
                  class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition cursor-pointer">
            <i class="fa-solid fa-plus mr-1"></i><i class="fa-solid fa-note-sticky mr-1"></i> 新增筆記
          </button>
          <!-- Permission Button (Owner only) / Display (Non-owner) -->
          <button v-if="isOwner" @click="openInfoModal(book, 'permission', 'book')"
                  class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 transition cursor-pointer"
                  title="點擊設定權限">
            <i class="fa-solid fa-lock text-xs"></i>
            <span>{{ permissionLabel }}</span>
          </button>
          <span v-else class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-sm text-gray-600 dark:text-gray-400">
            <i class="fa-solid fa-lock text-xs"></i>
            <span>{{ permissionLabel }}</span>
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
            <span v-for="tag in book.tags" :key="tag"
                  class="px-3 py-1 text-sm rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
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
      <div class="bg-white dark:bg-dark-surface rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        <div v-for="note in sortedNotes" :key="note.id"
             class="p-4 border-b dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center"
             @click="openNote(note)">
          <!-- Drag handle (only show if canEdit) -->
          <span v-if="canEdit" class="cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-3 px-1" @click.stop>
            <i class="fa-solid fa-grip-vertical"></i>
          </span>
          <!-- Note Icon and Title/Tags -->
          <div class="flex items-center flex-1 min-w-0">
            <span class="mr-3 text-gray-400 shrink-0"><i class="fa-solid fa-note-sticky"></i></span>
            <div class="flex-1 min-w-0">
              <span class="font-medium text-lg text-gray-800 dark:text-gray-200 truncate block" :title="note.title">{{ note.title || 'Untitled' }}</span>
              <!-- Tags below title -->
              <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                <span v-for="tag in note.tags.slice(0, 6)" :key="tag"
                      class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                  {{ tag }}
                </span>
                <span v-if="note.tags.length > 6"
                      class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      :title="note.tags.slice(6).join(', ')">
                  +{{ note.tags.length - 6 }}
                </span>
              </div>
            </div>
          </div>
          <!-- Date and Author (right side) -->
          <div class="text-right shrink-0 ml-4 text-xs text-gray-500 dark:text-gray-400">
            <div>{{ formatDate(note.lastEditedAt || note.updatedAt) }}</div>
            <div v-if="note.lastEditor || note.owner">by {{ note.lastEditor?.username || note.owner?.username }}</div>
          </div>
        </div>
        <div v-if="!sortedNotes || sortedNotes.length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
          這本書裡還沒有筆記。
          <button v-if="canAddNote" @click="createNote"
                  class="block mx-auto mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">
            <i class="fa-solid fa-plus mr-1"></i>建立第一篇筆記
          </button>
        </div>
      </div>
    </template>

    <!-- Info Modal -->
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
      </div>
    </div>
  </div>
</template>
