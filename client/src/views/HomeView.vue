<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import { SidebarNav, BookCard, NoteCard } from '@/components'

const route = useRoute()
const router = useRouter()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// User state
const user = ref(null)
const loading = ref(true)

// Data
const books = ref([])
const notes = ref([])
const pinnedItems = ref([])

// View mode
const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')

// Current route path
const currentRoute = computed(() => route.path)

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

// Display notes (uncategorized, not in trash)
const displayNotes = computed(() => {
  const filtered = notes.value.filter(n => !n.deletedAt && !n.bookId)
  if (globalViewMode.value === 'my') {
    return filtered.filter(n => n.isOwner)
  } else {
    return filtered.filter(n => n.isPublic)
  }
})

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

// Create Book Modal
const showCreateBookModal = ref(false)
const newBookTitle = ref('')
const newBookDescription = ref('')

// Load data
const loadData = async () => {
  loading.value = true
  try {
    const [userData, booksData, notesData, pinnedData] = await Promise.all([
      api.getMe().catch(() => null),
      api.getBooks(),
      api.getNotes(),
      api.getPinnedItems().catch(() => [])
    ])
    user.value = userData
    books.value = booksData
    notes.value = notesData
    pinnedItems.value = pinnedData
  } catch (e) {
    console.error('Failed to load data:', e)
  } finally {
    loading.value = false
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
  showUserProfileModal.value = true
}

// Save profile
const saveProfile = async () => {
  savingProfile.value = true
  try {
    await api.updateProfile({ name: editableName.value })
    user.value.name = editableName.value
    showUserProfileModal.value = false
  } catch (e) {
    showAlert?.('儲存失敗', 'error')
  } finally {
    savingProfile.value = false
  }
}

// Logout
const logout = async () => {
  await api.logout()
  window.location.href = '/login'
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
          <span>Home</span>
        </div>

        <!-- Books Section -->
        <section class="mb-6">
          <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">Books</h2>
          <div class="flex gap-4 pb-4" style="overflow-x: auto;">
            <!-- Empty State -->
            <div
              v-if="displayBooks.length === 0"
              @click="openCreateBookModal"
              class="w-64 shrink-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 p-6"
            >
              <i class="fa-solid fa-plus text-3xl text-green-500 mb-3"></i>
              <p class="text-gray-600 dark:text-gray-300 font-medium">新增書本</p>
            </div>
            <!-- Book Cards -->
            <BookCard
              v-for="book in displayBooks"
              :key="book.id"
              :book="book"
              :show-menu="openMenuId === 'book-' + book.id"
              :is-pinned="isPinned('book', book.id)"
              @click="openBook(book)"
              @toggle-menu="toggleMenu('book-' + book.id)"
              @open-info="() => {}"
              @toggle-pin="togglePin('book', book)"
              @delete="deleteBook(book)"
            />
          </div>
        </section>

        <!-- Notes Section (Uncategorized) -->
        <section>
          <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">Notes</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <!-- Empty State -->
            <div
              v-if="displayNotes.length === 0"
              @click="createNote"
              class="flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 min-h-[120px]"
            >
              <i class="fa-solid fa-plus text-3xl text-blue-500 mb-3"></i>
              <p class="text-gray-600 dark:text-gray-300 font-medium">新增筆記</p>
            </div>
            <NoteCard
              v-for="note in displayNotes"
              :key="note.id"
              :note="note"
              mode="grid"
              :show-menu="openMenuId === 'note-' + note.id"
              :is-pinned="isPinned('note', note.id)"
              @click="openNote(note)"
              @toggle-menu="toggleMenu('note-' + note.id)"
              @open-info="() => {}"
              @toggle-pin="togglePin('note', note)"
              @delete="deleteNote(note)"
            />
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
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-300 dark:border-gray-700 flex justify-between items-center">
            <span class="text-xs text-gray-400">v{{ appVersion }}</span>
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

    <!-- User Profile Modal -->
    <Teleport to="body">
      <div v-if="showUserProfileModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showUserProfileModal = false">
        <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-96">
          <h2 class="text-xl font-bold mb-4 text-gray-800 dark:text-white">
            <i class="fa-solid fa-user mr-2"></i>個人資料
          </h2>
          <div class="flex flex-col items-center mb-6">
            <div class="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-3"
                 :class="user ? 'bg-blue-600' : 'bg-gray-500'">
              <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover" alt="Avatar">
              <span v-else class="text-3xl text-white">{{ user?.username?.charAt(0).toUpperCase() || '?' }}</span>
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">帳號 (Username)</label>
            <div class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 text-sm">
              {{ user?.username }}
            </div>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">顯示名稱 (Name)</label>
            <input v-model="editableName" type="text" placeholder="輸入顯示名稱..."
                   class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="flex justify-end gap-2">
            <button @click="showUserProfileModal = false" class="px-4 py-2 text-gray-600 dark:text-gray-400 cursor-pointer">取消</button>
            <button @click="saveProfile" :disabled="savingProfile" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer">
              <i v-if="savingProfile" class="fa-solid fa-spinner fa-spin mr-1"></i>
              <i v-else class="fa-solid fa-save mr-1"></i>儲存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
