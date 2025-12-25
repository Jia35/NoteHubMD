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

// Display mode
const displayMode = ref(localStorage.getItem('NoteHubMD-bookDisplayMode') || 'list')

// Menu state
const openMenuId = ref(null)

// Info Modal state
const showInfoModal = ref(false)
const infoModalItem = ref(null)
const infoModalTab = ref('info')
const editablePermission = ref('private')
const infoCommentsEnabled = ref(true)

// Books list for moving notes
const allBooks = ref([])

// Sorted notes
const sortedNotes = computed(() => {
  if (!book.value?.notes) return []
  return [...book.value.notes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
})

// Available books for moving notes
const availableBooks = computed(() => {
  return allBooks.value.filter(b => b.isOwner || b.canEdit)
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
    const data = await api.getBook(route.params.id)
    book.value = data
    if (!book.value.tags) book.value.tags = []
    permission.value = data.permission || 'private'
    isOwner.value = data.isOwner || false
    canEdit.value = data.canEdit || false
    canAddNote.value = data.canAddNote || false
    
    // Update browser tab title
    const shortTitle = (data.title || 'Untitled').substring(0, 20)
    document.title = `${shortTitle} | NoteHubMD`
    
    // Load all books for move note functionality
    allBooks.value = await api.getBooks()
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
const openInfoModal = (note) => {
  infoModalItem.value = note
  editablePermission.value = note.permission || 'inherit'
  infoCommentsEnabled.value = note.commentsEnabled !== false
  infoModalTab.value = 'info'
  showInfoModal.value = true
  closeMenu()
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
  <div class="px-8 py-5 container mx-auto overflow-y-auto h-full">
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
      <div class="mb-6">
        <div class="flex items-start justify-between mb-2">
          <h1 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center">
            <i class="fa-solid fa-book text-green-500 mr-3"></i>
            {{ book.title }}
          </h1>
          <div class="flex items-center gap-2">
            <!-- Add Note Button -->
            <button
              v-if="canAddNote"
              @click="createNote"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm cursor-pointer"
            >
              <i class="fa-solid fa-plus mr-1"></i>新增筆記
            </button>
          </div>
        </div>
        <p v-if="book.description" class="text-gray-500 dark:text-gray-400 mb-2">
          {{ book.description }}
        </p>
        <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span><i class="fa-solid fa-user mr-1"></i>{{ book.owner?.username }}</span>
          <span><i class="fa-solid fa-clock mr-1"></i>{{ formatDate(book.updatedAt) }}</span>
          <span><i class="fa-solid fa-file-lines mr-1"></i>{{ book.notes?.length || 0 }} 篇筆記</span>
        </div>
        <!-- Tags -->
        <div v-if="book.tags?.length > 0" class="flex flex-wrap gap-1 mt-2">
          <span
            v-for="tag in book.tags"
            :key="tag"
            class="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- Notes Section -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-gray-700 dark:text-gray-300">筆記</h2>
          <!-- Display Mode Toggle -->
          <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 text-sm">
            <button
              @click="setDisplayMode('grid')"
              :class="displayMode === 'grid' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              class="px-2 py-1 rounded transition cursor-pointer"
              title="格狀顯示"
            >
              <i class="fa-solid fa-border-all"></i>
            </button>
            <button
              @click="setDisplayMode('list')"
              :class="displayMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              class="px-2 py-1 rounded transition cursor-pointer"
              title="清單顯示"
            >
              <i class="fa-solid fa-list"></i>
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="sortedNotes.length === 0" class="text-center py-12">
          <i class="fa-solid fa-file-lines text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
          <p class="text-gray-500 dark:text-gray-400 mb-4">此書本尚無筆記</p>
          <button
            v-if="canAddNote"
            @click="createNote"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer"
          >
            <i class="fa-solid fa-plus mr-1"></i>建立第一篇筆記
          </button>
        </div>

        <!-- Grid View -->
        <div v-else-if="displayMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <NoteCard
            v-for="note in sortedNotes"
            :key="note.id"
            :note="note"
            mode="grid"
            :show-menu="openMenuId === note.id"
            :is-pinned="isPinned('note', note.id)"
            :show-move-option="true"
            @toggle-menu="toggleMenu(note.id)"
            @open-info="openInfoModal(note)"
            @toggle-pin="togglePin('note', note.id)"
            @open-move="openInfoModal(note)"
            @delete="deleteNote(note.id)"
            @click="openNote(note)"
          />
        </div>

        <!-- List View -->
        <div v-else class="flex flex-col gap-2">
          <NoteCard
            v-for="note in sortedNotes"
            :key="note.id"
            :note="note"
            mode="list"
            :show-menu="openMenuId === note.id"
            :is-pinned="isPinned('note', note.id)"
            :show-move-option="true"
            @toggle-menu="toggleMenu(note.id)"
            @open-info="openInfoModal(note)"
            @toggle-pin="togglePin('note', note.id)"
            @open-move="openInfoModal(note)"
            @delete="deleteNote(note.id)"
            @click="openNote(note)"
          />
        </div>
      </div>
    </template>

    <!-- Info Modal -->
    <InfoModal
      :show="showInfoModal"
      type="note"
      :item="infoModalItem"
      :tab="infoModalTab"
      :editable-permission="editablePermission"
      :comments-enabled="infoCommentsEnabled"
      :books="availableBooks"
      @close="showInfoModal = false"
      @move-note="handleMoveNoteFromInfo"
      @update:tab="infoModalTab = $event"
      @update:permission="autoSavePermission"
      @update:commentsEnabled="autoSaveCommentsEnabled"
      @update:isPublic="autoSaveIsPublic"
    />
  </div>
</template>
