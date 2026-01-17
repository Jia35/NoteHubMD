<script setup>
import { ref, computed, provide, onMounted, inject } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { SidebarNav, CreateBookModal, SettingsModal, InfoModal, AboutModal } from '@/components'

const route = useRoute()
const router = useRouter()

// Global Modal State
const modal = ref({
  show: false,
  type: 'alert',
  title: '',
  message: '',
  confirmText: '確定',
  cancelText: '取消',
  resolve: null
})

// View Key for force refresh
const routerViewKey = ref(0)

const showAlert = (message, type = 'info', title = '') => {
  return new Promise((resolve) => {
    modal.value = {
      show: true,
      type: type,
      title: title,
      message: message,
      confirmText: '確定',
      cancelText: '取消',
      resolve: resolve
    }
  })
}

const showConfirm = (message, title = '確認') => {
  return new Promise((resolve) => {
    modal.value = {
      show: true,
      type: 'confirm',
      title: title,
      message: message,
      confirmText: '確定',
      cancelText: '取消',
      resolve: resolve
    }
  })
}

const closeModal = (result = true) => {
  modal.value.show = false
  if (modal.value.resolve) {
    modal.value.resolve(result)
  }
}

// Provide global modal functions
provide('modal', modal)
provide('showAlert', showAlert)
provide('showConfirm', showConfirm)
provide('closeModal', closeModal)

// ========================================
// Global Sidebar State (shared across pages)
// ========================================
const sidebarUser = ref(null)
const sidebarBooks = ref([])
const sidebarPinnedItems = ref([])
const sidebarLoading = ref(true)
const sidebarLoaded = ref(false)

// Load sidebar data (called once on first authenticated page)
const loadSidebarData = async (force = false) => {
  // Skip if already loaded and not forcing refresh (don't touch loading state)
  if (sidebarLoaded.value && !force) return
  
  // Only set loading true if we're actually going to load
  sidebarLoading.value = true
  try {
    const [userData, booksData, pinnedData] = await Promise.all([
      api.getMe().catch(() => null),
      api.getBooks().catch(() => []),
      api.getPinnedItems().catch(() => [])
    ])
    sidebarUser.value = userData
    sidebarBooks.value = booksData
    sidebarPinnedItems.value = pinnedData
    sidebarLoaded.value = true
  } catch (e) {
    console.error('Failed to load sidebar data:', e)
  } finally {
    sidebarLoading.value = false
  }
}

// Update functions for sidebar data
const updateSidebarBooks = (books) => {
  sidebarBooks.value = books
}

const updateSidebarPinnedItems = (items) => {
  sidebarPinnedItems.value = items
}

const updateSidebarUser = (userData) => {
  if (sidebarUser.value && typeof userData === 'object') {
    // Merge with existing user data to preserve properties like username, role, etc.
    sidebarUser.value = { ...sidebarUser.value, ...userData }
  } else {
    sidebarUser.value = userData
  }
}

// Clear sidebar data (for logout)
const clearSidebarData = () => {
  sidebarUser.value = null
  sidebarBooks.value = []
  sidebarPinnedItems.value = []
  sidebarLoaded.value = false
}

// Provide sidebar state and functions
provide('sidebarUser', sidebarUser)
provide('sidebarBooks', sidebarBooks)
provide('sidebarPinnedItems', sidebarPinnedItems)
provide('sidebarLoading', sidebarLoading)
provide('loadSidebarData', loadSidebarData)
provide('updateSidebarBooks', updateSidebarBooks)
provide('updateSidebarPinnedItems', updateSidebarPinnedItems)
provide('updateSidebarUser', updateSidebarUser)
provide('clearSidebarData', clearSidebarData)

// ========================================
// Sidebar UI Logic & Handlers
// ========================================

// Computed: Show Sidebar based on route meta
const showSidebar = computed(() => route.meta.showSidebar === true)

// Global View Mode
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')

const setGlobalViewMode = (mode) => {
  globalViewMode.value = mode
  localStorage.setItem('NoteHubMD-viewMode', mode)
}

provide('globalViewMode', globalViewMode)
provide('setGlobalViewMode', setGlobalViewMode)

// Theme State
const theme = ref(localStorage.getItem('NoteHubMD-theme') || 'dark')
const appVersion = ref('')

// Provide theme for child components
provide('theme', theme)

const setTheme = (newTheme) => {
  theme.value = newTheme
  localStorage.setItem('NoteHubMD-theme', newTheme)
  if (newTheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// Modal States
const showCreateBookModal = ref(false)
const showSettings = ref(false)
const settingsInitialTab = ref('')
const showAboutModal = ref(false)

// Provide open modal functions (optional, if needed by children)
provide('openCreateBookModal', () => showCreateBookModal.value = true)
provide('openSettingsModal', () => showSettings.value = true)

// Import/Export Logic
const exportingNotes = ref(false)
const importingNotes = ref(false)

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
    showAlert('匯出失敗：' + e.message, 'error')
  } finally {
    exportingNotes.value = false
  }
}

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

    showAlert(`匯入成功！建立了 ${result.stats.books} 本書本、${result.stats.notes} 篇筆記`, 'success')
    await loadSidebarData(true)
    // Force refresh current view to update lists (e.g. HomeView notes)
    routerViewKey.value++
  } catch (e) {
    showAlert('匯入失敗：' + e.message, 'error')
  } finally {
    importingNotes.value = false
    event.target.value = ''
  }
}

const handleImportFolder = async (event) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  const validFiles = Array.from(files).filter(f => {
    const name = f.name.toLowerCase()
    return name.endsWith('.md') || name.endsWith('.excalidraw') || name.endsWith('.drawio')
  })
  if (validFiles.length === 0) {
    showAlert('資料夾中沒有找到 .md、.excalidraw 或 .drawio 檔案', 'warning')
    event.target.value = ''
    return
  }

  importingNotes.value = true
  try {
    const formData = new FormData()
    // Collect paths for each file to preserve folder structure
    const paths = []
    validFiles.forEach(file => {
      // webkitRelativePath contains the relative path like "rootFolder/bookFolder/file.md"
      const relativePath = file.webkitRelativePath || file.name
      paths.push(relativePath)
      formData.append('files', file)
    })
    // Send paths as JSON string
    formData.append('paths', JSON.stringify(paths))

    const response = await fetch('/api/import/notes-folder', {
      method: 'POST',
      body: formData
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error || 'Import failed')
    }

    showAlert(`匯入成功！建立了 ${result.stats.books} 本書本、${result.stats.notes} 篇筆記`, 'success')

    await loadSidebarData(true)
    routerViewKey.value++
  } catch (e) {
    showAlert('匯入失敗：' + e.message, 'error')
  } finally {
    importingNotes.value = false
    event.target.value = ''
  }
}

// Filtered sidebar books logic
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return sidebarBooks.value.filter(book => book.isOwner)
  } else {
    return sidebarBooks.value.filter(book => book.isPublic)
  }
})

const limitedSidebarBooks = computed(() => filteredSidebarBooks.value.slice(0, 20))
const hasMoreBooks = computed(() => filteredSidebarBooks.value.length > 20)
const currentRoutePath = computed(() => route.path)

// Handlers
const createNote = async () => {
  try {
    const note = await api.createNote()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert('建立筆記失敗', 'error')
  }
}

const createWhiteboard = async () => {
  try {
    const note = await api.createWhiteboard()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert('建立白板失敗', 'error')
  }
}

const createFlowchart = async () => {
  try {
    const note = await api.createFlowchart()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert('建立流程圖失敗', 'error')
  }
}

/* [DISABLED] 釘選功能暫時停用
const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    // Update global pinned items
    const updatedItems = sidebarPinnedItems.value.filter(p => !(p.type === type && p.id === id))
    sidebarPinnedItems.value = updatedItems
  } catch (e) {
    showAlert('取消釘選失敗', 'error')
  }
}
*/

const handleBookCreated = async (bookData) => {
  try {
    // Actually create the book via API
    const newBook = await api.createBook(bookData)
    // Add new book to sidebar list
    sidebarBooks.value = [newBook, ...sidebarBooks.value]
    showCreateBookModal.value = false
    showAlert('新增書本成功', 'success')
    router.push(`/b/${newBook.id}`)
  } catch (e) {
    console.error('Failed to create book:', e)
    showAlert('建立書本失敗', 'error')
  }
}

const handleLogout = async () => {
  const confirmed = await showConfirm('確定要登出嗎？')
  if (!confirmed) return

  try {
    await api.logout()
    clearSidebarData()
    showSettings.value = false
    router.push('/login')
  } catch (e) {
    console.error('Logout failed:', e)
    router.push('/login')
  }
}

// Apply theme on mount and load version
onMounted(async () => {
  // Theme
  const storedTheme = localStorage.getItem('NoteHubMD-theme') || 'dark'
  setTheme(storedTheme)

  // Version
  const versionData = await api.getAppVersion()
  appVersion.value = versionData.version
})
</script>

<template>
  <div class="h-full w-full">
    <!-- Layout with Sidebar -->
    <div v-if="showSidebar" class="h-full flex bg-gray-50 dark:bg-dark-bg transition-colors duration-200">
      <!-- Sidebar -->
      <SidebarNav
        :user="sidebarUser"
        :books="limitedSidebarBooks"
        :pinned-items="sidebarPinnedItems"
        :show-pinned="true"
        :show-more-books="hasMoreBooks"
        :current-route="currentRoutePath"
        :global-view-mode="globalViewMode"
        :app-version="appVersion"
        @view-mode-change="setGlobalViewMode"
        @create-note="createNote"
        @create-whiteboard="createWhiteboard"
        @create-drawio="createFlowchart"
        @create-book="showCreateBookModal = true"
        @open-profile="settingsInitialTab = 'profile'; showSettings = true"
        @open-settings="settingsInitialTab = 'appearance'; showSettings = true"
      />

      <!-- Main Content Area -->
      <div class="flex-1 overflow-y-auto w-full relative">
        <RouterView :key="routerViewKey" />
      </div>
    </div>

    <!-- Layout without Sidebar (Login, NoteView, etc.) -->
    <RouterView v-else :key="routerViewKey" />

    <!-- Global Modals -->
    <CreateBookModal 
      :show="showCreateBookModal" 
      @close="showCreateBookModal = false" 
      @book-created="handleBookCreated" 
    />

    <SettingsModal 
      :show="showSettings" 
      :user="sidebarUser" 
      :theme="theme" 
      :app-version="appVersion"
      :initial-tab="settingsInitialTab"
      @close="showSettings = false; settingsInitialTab = ''"
      @set-theme="setTheme"
      @logout="handleLogout"
      @export-notes="exportNotes"
      @import-file="handleImportFile"
      @import-folder="handleImportFolder"
      @open-about="showAboutModal = true"
      @user-updated="updateSidebarUser"
    />

    <AboutModal 
      :show="showAboutModal" 
      :app-version="appVersion" 
      @close="showAboutModal = false" 
    />
  </div>

  <!-- Global Modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="modal.show"
        class="fixed inset-0 flex items-center justify-center bg-black/60"
        style="z-index: 200"
        @click.self="modal.type === 'alert' ? closeModal() : null"
      >
        <Transition name="modal-scale">
          <div
            v-if="modal.show"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
          >
            <!-- Header -->
            <div
              class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center"
              :class="{
                'bg-blue-50 dark:bg-blue-900/20': modal.type === 'info',
                'bg-green-50 dark:bg-green-900/20': modal.type === 'success',
                'bg-yellow-50 dark:bg-yellow-900/20': modal.type === 'warning',
                'bg-red-50 dark:bg-red-900/20': modal.type === 'error' || modal.type === 'confirm'
              }"
            >
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center mr-3"
                :class="{
                  'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300':
                    modal.type === 'info' || modal.type === 'alert',
                  'bg-green-100 text-green-600 dark:bg-green-800 dark:text-green-300':
                    modal.type === 'success',
                  'bg-yellow-100 text-yellow-600 dark:bg-yellow-800 dark:text-yellow-300':
                    modal.type === 'warning',
                  'bg-red-100 text-red-600 dark:bg-red-800 dark:text-red-300':
                    modal.type === 'error' || modal.type === 'confirm'
                }"
              >
                <i
                  class="fa-solid text-lg"
                  :class="{
                    'fa-circle-info': modal.type === 'info' || modal.type === 'alert',
                    'fa-circle-check': modal.type === 'success',
                    'fa-triangle-exclamation': modal.type === 'warning',
                    'fa-circle-xmark': modal.type === 'error',
                    'fa-question-circle': modal.type === 'confirm'
                  }"
                ></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ modal.title || (modal.type === 'confirm' ? '確認' : '提示') }}
              </h3>
            </div>
            <!-- Body -->
            <div class="px-6 py-4">
              <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ modal.message }}</p>
            </div>
            <!-- Footer -->
            <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
              <button
                v-if="modal.type === 'confirm'"
                @click="closeModal(false)"
                class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                {{ modal.cancelText || '取消' }}
              </button>
              <button
                @click="closeModal(true)"
                class="px-4 py-2 text-white rounded-lg transition"
                :class="{
                  'bg-blue-600 hover:bg-blue-700': modal.type === 'info' || modal.type === 'alert',
                  'bg-green-600 hover:bg-green-700': modal.type === 'success',
                  'bg-yellow-600 hover:bg-yellow-700': modal.type === 'warning',
                  'bg-red-600 hover:bg-red-700': modal.type === 'error' || modal.type === 'confirm'
                }"
              >
                {{ modal.confirmText || '確定' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
