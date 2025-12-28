<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { SidebarNav, BookCard, NoteCard, InfoModal } from '@/components'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

const route = useRoute()
const router = useRouter()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// Inject global sidebar data from App.vue
const user = inject('sidebarUser')
const books = inject('sidebarBooks')
const pinnedItems = inject('sidebarPinnedItems')
const loadSidebarData = inject('loadSidebarData')
const updateSidebarBooks = inject('updateSidebarBooks')
const updateSidebarPinnedItems = inject('updateSidebarPinnedItems')
const updateSidebarUser = inject('updateSidebarUser')
const clearSidebarData = inject('clearSidebarData')

// Local state
const loading = ref(true)
const notes = ref([])

// View mode
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')

// Current route path
const currentRoute = computed(() => route.path)

// Check if on uncategorized page
const isUncategorizedPage = computed(() => route.path === '/uncategorized')

// Sidebar books (filtered and limited)
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return books.value.filter(book => book.isOwner)
  } else {
    return books.value.filter(book => book.isPublic)
  }
})

const limitedSidebarBooks = computed(() => filteredSidebarBooks.value.slice(0, 20))
const hasMoreBooks = computed(() => filteredSidebarBooks.value.length > 20)

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
const theme = ref(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
const appVersion = ref('')

// Profile Modal
const showUserProfileModal = ref(false)
const editableName = ref('')
const avatarPreview = ref('')
const savingProfile = ref(false)
const avatarFile = ref(null)  // { cropped: File, original: File, cropData: object }
const avatarRemoved = ref(false)

// Avatar Cropper Modal
const showCropperModal = ref(false)
const cropperImageSrc = ref('')
const cropperImageRef = ref(null)
let cropperInstance = null
let pendingAvatarFile = null  // Original file before cropping

// Create Book Modal
const showCreateBookModal = ref(false)
const newBookTitle = ref('')
const newBookDescription = ref('')

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

// Export/Import Notes
const exportingNotes = ref(false)
const importingNotes = ref(false)
const showImportMenu = ref(false)
const importFileInput = ref(null)
const importFolderInput = ref(null)

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
const setTheme = (newTheme) => {
  theme.value = newTheme
  localStorage.setItem('NoteHubMD-theme', newTheme)
  if (newTheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// Load app version
const loadAppVersion = async () => {
  try {
    const data = await api.getAppVersion()
    appVersion.value = data.version || ''
  } catch (e) {
    appVersion.value = ''
  }
}

// Create note
const createNote = async () => {
  try {
    const note = await api.createNote()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert?.('建立筆記失敗', 'error')
  }
}

// Open create book modal
const openCreateBookModal = () => {
  newBookTitle.value = ''
  newBookDescription.value = ''
  showCreateBookModal.value = true
}

// Create book
const createBook = async () => {
  if (!newBookTitle.value.trim()) {
    showAlert?.('請輸入書本標題', 'warning')
    return
  }
  try {
    const book = await api.createBook({
      title: newBookTitle.value.trim(),
      description: newBookDescription.value.trim()
    })
    showCreateBookModal.value = false
    router.push('/b/' + book.id)
  } catch (e) {
    showAlert?.('建立書本失敗', 'error')
  }
}

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

// Check if item is pinned
const isPinned = (type, id) => {
  return pinnedItems.value.some(p => p.type === type && p.id === id)
}

// Open profile modal
const openUserProfileModal = () => {
  if (!user.value) return
  editableName.value = user.value.name || ''
  avatarPreview.value = user.value.avatar || ''
  avatarFile.value = null
  avatarRemoved.value = false
  showUserProfileModal.value = true
}

// Save profile
const saveProfile = async () => {
  savingProfile.value = true
  try {
    let avatarUrl = user.value.avatar
    let avatarOriginalUrl = user.value.avatarOriginal
    
    if (avatarRemoved.value) {
      avatarUrl = null
      avatarOriginalUrl = null
    } else if (avatarFile.value) {
      // Upload cropped avatar
      if (avatarFile.value.cropped) {
        const croppedResult = await api.uploadAvatar(avatarFile.value.cropped)
        avatarUrl = croppedResult.url
        
        // Upload original if available
        if (avatarFile.value.original) {
          const originalResult = await api.uploadAvatar(avatarFile.value.original)
          avatarOriginalUrl = originalResult.url
        }
      }
    }
    
    await api.updateProfile({
      name: editableName.value,
      avatar: avatarUrl,
      avatarOriginal: avatarOriginalUrl
    })
    
    user.value.name = editableName.value
    user.value.avatar = avatarUrl
    user.value.avatarOriginal = avatarOriginalUrl
    
    avatarFile.value = null
    avatarRemoved.value = false
    pendingAvatarFile = null
    showUserProfileModal.value = false
  } catch (e) {
    showAlert?.('儲存失敗', 'error')
  } finally {
    savingProfile.value = false
  }
}

// Handle avatar file change
const handleAvatarChange = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  pendingAvatarFile = file
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    showCropperModal.value = true
    
    // Initialize cropper after modal opens
    setTimeout(() => {
      if (cropperImageRef.value) {
        cropperInstance = new Cropper(cropperImageRef.value, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.9,
          cropBoxMovable: true,
          cropBoxResizable: true,
          background: false
        })
      }
    }, 100)
  }
  reader.readAsDataURL(file)
  event.target.value = '' // Reset input
}

// Close cropper modal
const closeCropperModal = () => {
  showCropperModal.value = false
  if (cropperInstance) {
    cropperInstance.destroy()
    cropperInstance = null
  }
  cropperImageSrc.value = ''
  pendingAvatarFile = null
}

// Rotate cropper
const rotateCropper = (degree) => {
  if (cropperInstance) {
    cropperInstance.rotate(degree)
  }
}

// Apply crop - save file locally, will upload on save
const applyCrop = async () => {
  if (!cropperInstance) return
  
  try {
    const cropData = cropperInstance.getData()
    const canvas = cropperInstance.getCroppedCanvas({
      width: 256,
      height: 256,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    })
    
    // Convert canvas to blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    
    // Store for save operation
    avatarFile.value = {
      cropped: croppedFile,
      original: pendingAvatarFile,
      cropData: cropData
    }
    avatarRemoved.value = false
    
    // Update preview
    avatarPreview.value = canvas.toDataURL('image/jpeg', 0.9)
    
    closeCropperModal()
  } catch (e) {
    showAlert?.('裁切失敗', 'error')
  }
}

// Open re-crop modal with existing avatar or pending file
const openReCropModal = () => {
  // Use pending original file, saved original, or current preview
  let imageSrc = null
  if (avatarFile.value?.original) {
    // Read pending original file
    const reader = new FileReader()
    reader.onload = (e) => {
      cropperImageSrc.value = e.target.result
      showCropperModal.value = true
      initCropperWithDelay()
    }
    reader.readAsDataURL(avatarFile.value.original)
    return
  } else if (user.value?.avatarOriginal) {
    imageSrc = user.value.avatarOriginal
  } else if (avatarPreview.value) {
    imageSrc = avatarPreview.value
  }
  
  if (!imageSrc) return
  
  cropperImageSrc.value = imageSrc
  showCropperModal.value = true
  initCropperWithDelay()
}

// Helper to init cropper after delay
const initCropperWithDelay = () => {
  setTimeout(() => {
    if (cropperImageRef.value) {
      cropperInstance = new Cropper(cropperImageRef.value, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        cropBoxMovable: true,
        cropBoxResizable: true,
        background: false
      })
    }
  }, 100)
}

// Open edit avatar modal (alias for re-crop)
const openEditAvatarModal = () => {
  openReCropModal()
}

// Remove avatar (marks for removal, actual delete on save)
const removeAvatar = () => {
  avatarPreview.value = ''
  avatarFile.value = null
  avatarRemoved.value = true
}

// Logout
const logout = async () => {
  await api.logout()
  window.location.href = '/login'
}

// Export Notes
const exportNotes = async () => {
  if (exportingNotes.value) return
  exportingNotes.value = true
  try {
    const response = await fetch('/api/export/my-notes')
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Export failed')
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const contentDisposition = response.headers.get('Content-Disposition')
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
    a.download = filenameMatch ? filenameMatch[1] : 'notes_export.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (e) {
    showAlert?.('匯出失敗：' + e.message, 'error')
  } finally {
    exportingNotes.value = false
  }
}

// Import Notes from file
const handleImportFile = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  importingNotes.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/import/notes', {
      method: 'POST',
      body: formData
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || 'Import failed')
    }

    showAlert?.(`匯入成功！建立了 ${result.stats.books} 本書本、${result.stats.notes} 篇筆記`, 'success')
    await loadData()
  } catch (e) {
    showAlert?.('匯入失敗：' + e.message, 'error')
  } finally {
    importingNotes.value = false
    event.target.value = ''
  }
}

// Import Notes from folder
const handleImportFolder = async (event) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  const mdFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.md'))
  if (mdFiles.length === 0) {
    showAlert?.('資料夾中沒有找到 .md 檔案', 'warning')
    event.target.value = ''
    return
  }

  importingNotes.value = true
  try {
    const formData = new FormData()
    mdFiles.forEach(file => {
      formData.append('files', file)
    })

    const response = await fetch('/api/import/notes-folder', {
      method: 'POST',
      body: formData
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || 'Import failed')
    }

    showAlert?.(`匯入成功！建立了 ${result.stats.books} 本書本、${result.stats.notes} 篇筆記`, 'success')
    await loadData()
  } catch (e) {
    showAlert?.('匯入失敗：' + e.message, 'error')
  } finally {
    importingNotes.value = false
    event.target.value = ''
  }
}

// Handle click outside to close menu
onMounted(() => {
  loadData()
  loadAppVersion()
  document.addEventListener('click', closeMenu)
  
  // Sync theme state with DOM
  theme.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
})

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
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
      @create-note="createNote"
      @create-book="openCreateBookModal"
      @open-profile="openUserProfileModal"
      @open-settings="showSettings = true"
    />

    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center h-full">
        <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
      </div>

      <!-- Content -->
      <div v-else class="px-8 py-5 h-full overflow-y-auto">
        <!-- Breadcrumb -->
        <div class="mb-4 text-gray-500 dark:text-gray-400">
          <router-link v-if="isUncategorizedPage" to="/" class="hover:text-blue-500">Home</router-link>
          <span v-if="isUncategorizedPage" class="mx-2">/</span>
          <span>{{ isUncategorizedPage ? '未分類筆記' : 'Home' }}</span>
        </div>

        <!-- Sort & Display Controls (at top, applies to all) -->
        <div v-if="!isUncategorizedPage || sortedNotes.length > 0" class="mb-6 flex flex-wrap gap-4 items-center justify-between">
          <h1 v-if="!isUncategorizedPage" class="text-2xl font-bold text-gray-800 dark:text-white">
            <i class="fa-solid fa-house mr-2"></i>首頁
          </h1>
          <h1 v-else class="text-2xl font-bold text-gray-800 dark:text-white">
            <i class="fa-solid fa-inbox mr-2"></i>未分類筆記
          </h1>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-sort mr-1"></i>排序：</span>
            <select :value="sortBy" @change="setSortBy($event.target.value)"
                    class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
              <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <button @click="toggleSortOrder"
                    class="px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                    :title="sortOrder === 'desc' ? '降冪' : '升冪'">
              <i :class="sortOrder === 'desc' ? 'fa-solid fa-arrow-down-wide-short' : 'fa-solid fa-arrow-up-wide-short'"></i>
            </button>
            <!-- View Toggle -->
            <div class="border-l border-gray-300 dark:border-gray-600 h-6 mx-2"></div>
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 text-sm">
              <button type="button" @click="setDisplayMode('grid')"
                      :class="displayMode === 'grid' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
                      class="px-2 py-1 rounded transition cursor-pointer" title="格狀顯示">
                <i class="fa-solid fa-border-all pointer-events-none"></i>
              </button>
              <button type="button" @click="setDisplayMode('list')"
                      :class="displayMode === 'list' ? 'bg-white dark:bg-gray-600 text-blue-500 shadow-sm' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
                      class="px-2 py-1 rounded transition cursor-pointer" title="清單顯示">
                <i class="fa-solid fa-list pointer-events-none"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Books Section (not shown on uncategorized page) -->
        <section v-if="!isUncategorizedPage" class="mb-6">
          <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">Books</h2>
          <div class="flex gap-4 pb-4" style="overflow-x: auto;">
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

        <!-- Notes Section (Uncategorized) -->
        <section>
          <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">{{ isUncategorizedPage ? '未分類筆記' : 'Notes' }}</h2>

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
    </div>

    <!-- Create Book Modal -->
    <Teleport to="body">
      <div v-if="showCreateBookModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showCreateBookModal = false">
        <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-96">
          <h2 class="text-xl font-bold mb-4 text-gray-800 dark:text-white">
            <i class="fa-solid fa-book mr-2"></i>新增書本
          </h2>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">書本標題</label>
            <input
              v-model="newBookTitle"
              type="text"
              placeholder="輸入書本標題..."
              class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              @keyup.enter="createBook"
            />
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">描述 (選填)</label>
            <textarea
              v-model="newBookDescription"
              rows="3"
              placeholder="輸入描述..."
              class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            ></textarea>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="showCreateBookModal = false" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
              取消
            </button>
            <button @click="createBook" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition">
              <i class="fa-solid fa-plus mr-1"></i>建立
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Settings Modal -->
    <Teleport to="body">
      <div v-if="showSettings" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showSettings = false">
        <div class="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center">
              <i class="fa-solid fa-gear mr-2 text-gray-400"></i> 設定
            </h2>
            <button @click="showSettings = false" class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
          
          <!-- Body -->
          <div class="p-6 space-y-6">
            <!-- Appearance -->
            <div>
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">外觀</h3>
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                  <i class="fa-solid fa-palette mr-2 text-gray-400"></i>主題模式
                </span>
                <div class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    @click="setTheme('light')"
                    class="px-3 py-1.5 rounded-md text-sm transition flex items-center cursor-pointer"
                    :class="theme === 'light' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                  >
                    <i class="fa-solid fa-sun mr-1.5"></i> Light
                  </button>
                  <button
                    @click="setTheme('dark')"
                    class="px-3 py-1.5 rounded-md text-sm transition flex items-center cursor-pointer"
                    :class="theme === 'dark' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                  >
                    <i class="fa-solid fa-moon mr-1.5"></i> Dark
                  </button>
                </div>
              </div>
            </div>

            <!-- Data Management (only for logged in users) -->
            <div v-if="user">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">資料管理</h3>
              <!-- Export Notes -->
              <button @click="exportNotes" :disabled="exportingNotes"
                      class="flex items-center w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm cursor-pointer">
                <div class="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-3 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform shrink-0">
                  <i :class="exportingNotes ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-export'"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-sm text-gray-800 dark:text-white">匯出我的筆記</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">下載所有筆記為 .zip 檔案</div>
                </div>
              </button>
              <!-- Import Notes -->
              <input type="file" ref="importFileInput" @change="handleImportFile" accept=".md,.zip" class="hidden">
              <input type="file" ref="importFolderInput" @change="handleImportFolder" webkitdirectory class="hidden">
              <div class="relative mt-2">
                <button @click="showImportMenu = !showImportMenu" :disabled="importingNotes"
                        class="flex items-center w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm cursor-pointer">
                  <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0">
                    <i :class="importingNotes ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-import'"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-gray-800 dark:text-white">匯入筆記</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate">上傳 .md、.zip 或資料夾</div>
                  </div>
                  <i class="fa-solid fa-chevron-down text-gray-400 ml-2"></i>
                </button>
                <!-- Dropdown Menu -->
                <div v-show="showImportMenu"
                     class="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                  <button @click="importFileInput?.click(); showImportMenu = false"
                          class="flex items-center w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left cursor-pointer">
                    <i class="fa-solid fa-file text-blue-500 mr-3"></i>
                    <span class="text-sm text-gray-700 dark:text-gray-200">上傳檔案 (.md 或 .zip)</span>
                  </button>
                  <button @click="importFolderInput?.click(); showImportMenu = false"
                          class="flex items-center w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-t border-gray-100 dark:border-gray-700 cursor-pointer">
                    <i class="fa-solid fa-folder text-yellow-500 mr-3"></i>
                    <span class="text-sm text-gray-700 dark:text-gray-200">上傳資料夾</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Admin (Conditional) -->
            <div v-if="user && (user.role === 'super-admin' || user.role === 'admin')">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">管理者</h3>
              <router-link to="/admin" @click="showSettings = false"
                           class="flex items-center w-full p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition border border-purple-100 dark:border-purple-800/30 group">
                <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center mr-3 text-purple-600 dark:text-purple-300 group-hover:scale-110 transition-transform">
                  <i class="fa-solid fa-user-shield text-lg"></i>
                </div>
                <div class="text-left flex-1">
                  <div class="font-bold text-sm">管理後台</div>
                  <div class="text-xs opacity-70">進入系統管理介面</div>
                </div>
                <i class="fa-solid fa-chevron-right ml-2 text-sm opacity-30"></i>
              </router-link>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-300 dark:border-gray-700 flex justify-between items-center">
            <button @click="showSettings = false; showAboutModal = true" title="關於 NoteHubMD"
                    class="text-xs text-gray-400 hover:text-blue-500 transition flex items-center cursor-pointer">
              v{{ appVersion }} <i class="fa-solid fa-circle-info ml-1 text-[10px]"></i>
            </button>
            <button v-if="user" @click="logout" class="flex items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition cursor-pointer">
              <i class="fa-solid fa-right-from-bracket mr-2"></i>登出
            </button>
            <router-link v-else to="/login" @click="showSettings = false" class="flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition">
              <i class="fa-solid fa-right-to-bracket mr-2"></i>登入
            </router-link>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- About Modal -->
    <Teleport to="body">
      <div v-if="showAboutModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showAboutModal = false">
        <div class="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <!-- Header -->
          <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center">
              <i class="fa-solid fa-circle-info mr-2 text-blue-500"></i> 關於 NoteHubMD
            </h2>
            <button @click="showAboutModal = false"
                    class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
          <!-- Body -->
          <div class="p-6 text-center">
            <img src="@/assets/images/logo.png" alt="NoteHubMD"
                 class="w-20 h-20 mx-auto mb-4 cursor-pointer hover:animate-bounce transition-transform">
            <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-1">NoteHubMD</h3>
            <p class="text-xs text-gray-400 mb-3">v{{ appVersion }}</p>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-10">
              現代化、可自架的 Markdown 筆記平台，支援即時協作。
            </p>
            <hr class="border-gray-200 dark:border-gray-700 mb-6">
            <div class="text-left text-gray-600 dark:text-gray-400">
              <h4 class="text-sm font-bold mb-2">
                ❄️ 雪之妖精——「北長尾山雀」
              </h4>
              <p class="text-sm leading-relaxed mb-3">
                外型像一顆長尾巴的棉花糖，圓滾滾又呆萌，卻是觀察力滿點的小鳥。牠們行動安靜、習慣群聚，總在枝頭默默記錄季節的變化。
              </p>
              <p class="text-sm leading-relaxed">
                靈感就像牠們一樣，靈動可愛卻又稍縱即逝，不趕快記下來就會咻——地飛走，快把它們「抓」進筆記裡吧！
              </p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- User Profile Modal -->
    <Teleport to="body">
      <div v-if="showUserProfileModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showUserProfileModal = false">
        <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-96 text-gray-900 dark:text-gray-100">
          <h2 class="text-xl font-bold mb-4"><i class="fa-solid fa-user mr-2"></i>個人資料</h2>

          <!-- Avatar Section -->
          <div class="flex flex-col items-center mb-6">
            <label class="cursor-pointer group">
              <div class="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-3 relative"
                   :class="user ? 'bg-blue-600' : 'bg-gray-500'">
                <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover" alt="Avatar">
                <span v-else class="text-3xl text-white">{{ user?.username?.charAt(0).toUpperCase() || '?' }}</span>
                <!-- Hover overlay -->
                <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <i class="fa-solid fa-camera text-white text-xl"></i>
                </div>
              </div>
              <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange">
            </label>
            <div class="flex gap-3">
              <label class="cursor-pointer text-blue-600 hover:text-blue-700 text-sm">
                <i class="fa-solid fa-camera mr-1"></i>變更頭像
                <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange">
              </label>
              <button v-if="avatarPreview && !avatarRemoved" @click="openReCropModal"
                      class="text-purple-500 hover:text-purple-600 text-sm cursor-pointer">
                <i class="fa-solid fa-crop mr-1"></i>重新裁切
              </button>
              <button v-if="avatarPreview" @click="removeAvatar"
                      class="text-red-500 hover:text-red-600 text-sm cursor-pointer">
                <i class="fa-solid fa-trash mr-1"></i>移除頭像
              </button>
            </div>
          </div>

          <!-- Avatar Cropper Modal -->
          <div v-if="showCropperModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
            <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-full max-w-lg mx-4 text-gray-900 dark:text-gray-100">
              <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold"><i class="fa-solid fa-crop mr-2"></i>裁切頭像</h2>
                <button @click="closeCropperModal"
                        class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
                  <i class="fa-solid fa-xmark text-lg"></i>
                </button>
              </div>

              <!-- Cropper Container -->
              <div class="relative w-full h-80 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-4">
                <img ref="cropperImageRef" :src="cropperImageSrc" class="max-w-full" style="display: block; max-width: 100%;">
              </div>

              <!-- Cropper Actions -->
              <div class="flex justify-between items-center">
                <div class="flex gap-2">
                  <button @click="rotateCropper(-90)"
                          class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                          title="向左旋轉">
                    <i class="fa-solid fa-rotate-left"></i>
                  </button>
                  <button @click="rotateCropper(90)"
                          class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                          title="向右旋轉">
                    <i class="fa-solid fa-rotate-right"></i>
                  </button>
                </div>
                <div class="flex gap-2">
                  <button @click="closeCropperModal"
                          class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
                    取消
                  </button>
                  <button @click="applyCrop"
                          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition cursor-pointer">
                    <i class="fa-solid fa-check mr-1"></i>確定裁切
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Username (read-only) -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">帳號 (Username)</label>
            <div class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 text-sm">
              {{ user?.username }}
            </div>
          </div>

          <!-- Name (editable) -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">顯示名稱 (Name)</label>
            <input v-model="editableName" type="text" placeholder="輸入顯示名稱..."
                   class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button @click="showUserProfileModal = false"
                    class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
              取消
            </button>
            <button @click="saveProfile" :disabled="savingProfile"
                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer">
              <i v-if="savingProfile" class="fa-solid fa-spinner fa-spin mr-1"></i>
              <i v-else class="fa-solid fa-save mr-1"></i>
              儲存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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
