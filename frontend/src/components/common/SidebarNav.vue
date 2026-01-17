<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import api from '@/composables/useApi'
import { debounce } from '@/composables/useUtils'

const props = defineProps({
  user: { type: Object, default: null },
  books: { type: Array, default: () => [] },
  pinnedItems: { type: Array, default: () => [] },
  showPinned: { type: Boolean, default: true },
  showMoreBooks: { type: Boolean, default: false },
  currentRoute: { type: String, default: '/' },
  globalViewMode: { type: String, default: 'my' },
  appVersion: { type: String, default: '' }
})

const emit = defineEmits(['unpin', 'view-mode-change', 'create-note', 'create-whiteboard', 'create-drawio', 'create-book', 'open-profile', 'open-settings'])

// Create dropdown state
const showCreateDropdown = ref(false)
const createDropdownRef = ref(null)

const toggleCreateDropdown = () => {
  showCreateDropdown.value = !showCreateDropdown.value
}

const closeCreateDropdown = () => {
  showCreateDropdown.value = false
}

const handleCreateNote = () => {
  closeCreateDropdown()
  emit('create-note')
}

const handleCreateWhiteboard = () => {
  closeCreateDropdown()
  emit('create-whiteboard')
}

const handleCreateFlowchart = () => {
  closeCreateDropdown()
  emit('create-drawio')
}

// Handle click outside dropdown
const handleClickOutside = (event) => {
  if (createDropdownRef.value && !createDropdownRef.value.contains(event.target)) {
    closeCreateDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// Search Modal state
const showSearchModal = ref(false)
const searchQuery = ref('')
const includeContent = ref(false)
const searchLoading = ref(false)
const searchResults = ref({ books: [], notes: [] })
const searchInput = ref(null)
const allTags = ref([])
const selectedTag = ref('')
const searchOwnerFilter = ref('my')
const searchDateRange = ref('all')
const searchDateStart = ref('')
const searchDateEnd = ref('')

let cachedNotes = []
let cachedBooks = []

const loadTagsAndData = async () => {
  try {
    const [notes, books] = await Promise.all([
      api.getAllNotesForTags(),
      api.getBooks()
    ])
    cachedNotes = notes
    cachedBooks = books

    const tagSet = new Set()
    notes.forEach(n => n.tags?.forEach(t => tagSet.add(t)))
    books.forEach(b => b.tags?.forEach(t => tagSet.add(t)))
    allTags.value = Array.from(tagSet).sort()
  } catch (e) {
    console.error('[SidebarNav] Failed to load data:', e)
  }
}

const openSearchModal = async () => {
  showSearchModal.value = true
  searchQuery.value = ''
  selectedTag.value = ''
  searchOwnerFilter.value = 'my'
  searchDateRange.value = 'all'
  searchDateStart.value = ''
  searchDateEnd.value = ''
  searchResults.value = { books: [], notes: [] }
  await loadTagsAndData()
  nextTick(() => {
    searchInput.value?.focus()
  })
}

const toggleTag = (tag) => {
  selectedTag.value = selectedTag.value === tag ? '' : tag
  performSearch()
}

const isWithinDateRange = (item) => {
  if (searchDateRange.value === 'all') return true
  const itemDate = new Date(item.updatedAt || item.createdAt)
  const now = new Date()

  switch (searchDateRange.value) {
    case 'today':
      return itemDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case 'week':
      return itemDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'month':
      return itemDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case 'year':
      return itemDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    case 'custom':
      if (!searchDateStart.value && !searchDateEnd.value) return true
      if (searchDateStart.value) {
        const startDate = new Date(searchDateStart.value)
        startDate.setHours(0, 0, 0, 0)
        if (itemDate < startDate) return false
      }
      if (searchDateEnd.value) {
        const endDate = new Date(searchDateEnd.value)
        endDate.setHours(23, 59, 59, 999)
        if (itemDate > endDate) return false
      }
      return true
    default:
      return true
  }
}

const matchesOwnerFilter = (item) => {
  if (searchOwnerFilter.value === 'all') return true
  if (searchOwnerFilter.value === 'my') return item.isOwner === true
  if (searchOwnerFilter.value === 'public') return item.isPublic === true
  return true
}

const performSearch = debounce(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const tag = selectedTag.value
  const hasDateFilter = searchDateRange.value !== 'all' &&
    !(searchDateRange.value === 'custom' && !searchDateStart.value && !searchDateEnd.value)
  const hasFilters = searchOwnerFilter.value !== 'all' || hasDateFilter

  if (!query && !tag && !hasFilters) {
    searchResults.value = { books: [], notes: [] }
    return
  }

  searchLoading.value = true
  try {
    const matchingNotes = cachedNotes.filter(note => {
      if (!matchesOwnerFilter(note)) return false
      if (!isWithinDateRange(note)) return false
      if (tag && (!note.tags || !note.tags.includes(tag))) return false
      if (!query) return true
      const titleMatch = (note.title || '').toLowerCase().includes(query)
      const descMatch = (note.description || '').toLowerCase().includes(query)
      if (includeContent.value) {
        const contentMatch = (note.content || '').toLowerCase().includes(query)
        return titleMatch || descMatch || contentMatch
      }
      return titleMatch || descMatch
    })

    const matchingBooks = cachedBooks.filter(book => {
      if (!matchesOwnerFilter(book)) return false
      if (!isWithinDateRange(book)) return false
      if (tag && (!book.tags || !book.tags.includes(tag))) return false
      if (!query) return true
      const titleMatch = (book.title || '').toLowerCase().includes(query)
      const descMatch = (book.description || '').toLowerCase().includes(query)
      return titleMatch || descMatch
    })

    searchResults.value = {
      books: matchingBooks.slice(0, 20),
      notes: matchingNotes.slice(0, 20)
    }
  } catch (e) {
    console.error('[SidebarNav] Search failed:', e)
  } finally {
    searchLoading.value = false
  }
}, 300)

watch(searchQuery, () => performSearch())
watch(includeContent, () => {
  if (searchQuery.value.trim() || selectedTag.value || searchOwnerFilter.value !== 'all' || searchDateRange.value !== 'all') {
    performSearch()
  }
})
watch(searchOwnerFilter, () => performSearch())
watch(searchDateRange, () => performSearch())
watch(searchDateStart, () => { if (searchDateRange.value === 'custom') performSearch() })
watch(searchDateEnd, () => { if (searchDateRange.value === 'custom') performSearch() })

const formatDate = (date) => {
  return window.dayjs ? window.dayjs(date).format('YYYY/MM/DD HH:mm') : new Date(date).toLocaleDateString()
}
</script>

<template>
  <div class="w-56 bg-gray-200 dark:bg-gray-900 dark:text-white flex flex-col h-full border-r border-gray-300 dark:border-gray-800 shrink-0">
    <!-- Header -->
    <router-link to="/" class="p-4 flex items-center border-b border-gray-300 hover:bg-gray-300 dark:border-gray-800 dark:hover:bg-gray-800 transition">
      <img src="@/assets/images/logo.png" alt="NoteHubMD" class="w-8 h-8 mr-3" />
      <span class="font-bold text-lg tracking-wide">NoteHubMD</span>
    </router-link>

    <!-- Search Buttons -->
    <div class="p-3 space-y-2 border-b border-gray-200 dark:border-gray-800">
      <button
        @click="openSearchModal"
        class="w-full bg-gray-300 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition flex items-center justify-center text-sm cursor-pointer"
      >
        <i class="fa-solid fa-search mr-2"></i> 搜尋
      </button>
    </div>

    <!-- View Mode Toggle -->
    <div class="px-3 py-1">
      <div class="flex bg-gray-300 dark:bg-gray-700 rounded-lg p-1">
        <button
          @click="emit('view-mode-change', 'my')"
          class="flex-1 px-2 py-1 text-sm rounded-md transition cursor-pointer"
          :class="globalViewMode === 'my'
            ? 'bg-gray-200 text-blue-600 dark:bg-gray-600 dark:text-blue-400 font-medium'
            : 'text-gray-600 dark:text-gray-400 dark:hover:text-white'"
        >
          <i class="fa-solid fa-user mr-1"></i>我的項目
        </button>
        <button
          @click="emit('view-mode-change', 'all')"
          class="flex-1 px-2 py-1 text-sm rounded-md transition cursor-pointer"
          :class="globalViewMode === 'all'
            ? 'bg-gray-200 text-blue-600 dark:bg-gray-600 dark:text-blue-400 font-medium'
            : 'text-gray-600 dark:text-gray-400 dark:hover:text-white'"
        >
          <i class="fa-solid fa-globe mr-1"></i>公開項目
        </button>
      </div>
    </div>

    <!-- Create Buttons -->
    <div class="p-3 space-y-2 border-b border-gray-200 dark:border-gray-800">
      <!-- Split Button: 新增筆記 with dropdown -->
      <div class="relative" ref="createDropdownRef">
        <div class="flex w-full">
          <button
            @click="emit('create-note')"
            class="flex-1 bg-blue-600 text-white ps-4 py-2 rounded-l-lg hover:bg-blue-700 transition flex items-center justify-center text-sm cursor-pointer"
          >
            <i class="fa-solid fa-note-sticky mr-1"></i> 新增筆記
          </button>
          <button
            @click="toggleCreateDropdown"
            class="bg-blue-600 text-white px-2.5 py-2 rounded-r-lg hover:bg-blue-700 transition flex items-center justify-center text-sm border-l border-blue-500">
            <i class="fa-solid fa-chevron-down text-xs"></i>
          </button>
        </div>
        <!-- Dropdown Menu -->
        <div
          v-show="showCreateDropdown"
          class="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border-2 border-blue-600 rounded-lg shadow-lg z-10 overflow-hidden"
        >
          <button
            @click="handleCreateNote"
            class="w-full px-8 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center"
          >
            <i class="fa-solid fa-note-sticky mr-2 text-blue-500"></i>Markdown
          </button>
          <button
            @click="handleCreateWhiteboard"
            class="w-full px-8 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center"
          >
            <i class="fa-solid fa-chalkboard mr-2 text-purple-500"></i>白板
          </button>
          <button
            @click="handleCreateFlowchart"
            class="w-full px-8 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center"
          >
            <i class="fa-solid fa-project-diagram mr-2 text-teal-500"></i>流程圖
          </button>
        </div>
      </div>
      <button
        @click="emit('create-book')"
        class="w-full bg-transparent text-green-600 px-4 py-1.5 rounded-lg hover:bg-green-600 hover:text-white transition flex items-center justify-center text-sm border border-green-600"
      >
        <i class="fa-solid fa-book mr-1"></i> 新增書本
      </button>
    </div>

    <!-- Navigation -->
    <div class="flex-1 overflow-y-auto p-3">
      <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Menu</div>
      <router-link
        to="/trash"
        class="block px-2 py-1 mb-1 rounded transition flex items-center"
        :class="currentRoute === '/trash' ? 'bg-gray-300 dark:bg-gray-700 dark:text-white' : 'hover:bg-gray-200 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 dark:hover:text-white'"
      >
        <span class="w-5 mr-3 text-center shrink-0">
          <i class="fa-solid fa-trash-can" :class="currentRoute === '/trash' ? 'dark:text-white' : 'text-gray-500 dark:text-gray-400'"></i>
        </span>
        垃圾桶
      </router-link>

      <!-- [DISABLED] Pinned Items - 釘選功能暫時停用
      <template v-if="showPinned && pinnedItems && pinnedItems.length > 0">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 flex items-center">
          <span class="w-5 mr-2 text-center shrink-0"><i class="fa-solid fa-thumbtack"></i></span> Pinned
        </div>
        <div v-for="item in pinnedItems" :key="item.type + '-' + item.id" class="group">
          <a
            v-if="item.type === 'note'"
            :href="'/n/' + item.id"
            class="block px-3 py-1 mb-1 rounded transition flex items-center justify-between"
            :class="currentRoute === '/n/' + item.id ? 'bg-gray-300 dark:bg-gray-700 dark:text-white' : 'hover:bg-gray-200 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 dark:hover:text-white'"
          >
            <div class="flex items-center min-w-0">
              <span class="w-5 mr-3 text-center shrink-0"><i class="fa-solid fa-note-sticky"></i></span>
              <span class="truncate" :title="item.title || 'Untitled'">{{ item.title || 'Untitled' }}</span>
            </div>
            <button
              @click.prevent.stop="emit('unpin', item.type, item.id)"
              class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition ml-2 shrink-0 cursor-pointer"
              title="取消釘選"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </a>
          <router-link
            v-else
            :to="'/b/' + item.id"
            class="block px-3 py-1 mb-1 rounded transition flex items-center justify-between"
            :class="currentRoute === '/b/' + item.id ? 'bg-gray-300 dark:bg-gray-700 dark:text-white' : 'hover:bg-gray-200 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 dark:hover:text-white'"
          >
            <div class="flex items-center min-w-0">
              <span class="w-5 mr-3 text-center shrink-0"><i class="fa-solid fa-book"></i></span>
              <span class="truncate" :title="item.title || 'Untitled'">{{ item.title || 'Untitled' }}</span>
            </div>
            <button
              @click.prevent.stop="emit('unpin', item.type, item.id)"
              class="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition ml-2 shrink-0 cursor-pointer"
              title="取消釘選"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </router-link>
        </div>
      </template>
      -->

      <!-- Books Section -->
      <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 flex items-center justify-between">
        <span>Books</span>
        <router-link to="/books" class="text-gray-400 hover:text-white transition" title="全部書本">
          <i class="fa-solid fa-arrow-right"></i>
        </router-link>
      </div>
      <router-link
        to="/uncategorized"
        class="block px-2 py-1 mb-1 rounded transition flex items-center"
        :class="currentRoute === '/uncategorized' ? 'bg-gray-300 dark:bg-gray-700 dark:text-white' : 'hover:bg-gray-200 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 dark:hover:text-white'"
      >
        <span class="w-5 mr-2 text-center shrink-0">
          <i class="fa-solid fa-inbox" :class="currentRoute === '/uncategorized' ? 'dark:text-white' : 'text-gray-500 dark:text-gray-400'"></i>
        </span>
        <span class="truncate">未分類筆記</span>
      </router-link>
      <div v-for="book in books" :key="book.id">
        <router-link
          :to="'/b/' + book.id"
          class="block px-2 py-1 mb-1 rounded transition flex items-center"
          :class="currentRoute === '/b/' + book.id ? 'bg-gray-300 dark:bg-gray-700 dark:text-white' : 'hover:bg-gray-200 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 dark:hover:text-white'"
        >
          <span class="w-5 mr-2 text-center shrink-0"><i class="fa-solid fa-book text-green-500"></i></span>
          <span class="truncate" :title="book.title + ' (' + (book.noteCount ?? 0) + ')'">
            {{ book.title }} ({{ book.noteCount ?? 0 }})
          </span>
        </router-link>
      </div>
      <router-link
        v-if="showMoreBooks"
        to="/books"
        class="block px-2 py-1 mb-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition flex items-center text-sm"
      >
        <span class="w-5 mr-2 text-center shrink-0"><i class="fa-solid fa-ellipsis"></i></span>
        <span class="truncate">更多書本...</span>
      </router-link>
    </div>

    <!-- User & Settings -->
    <div class="p-4 border-t border-gray-300 bg-gray-200 dark:border-gray-800 dark:bg-gray-900">
      <div class="flex items-center justify-between">
        <button @click="emit('open-profile')" class="flex items-center overflow-hidden cursor-pointer hover:opacity-80 transition">
          <div
            class="w-8 h-8 rounded-full text-white flex items-center justify-center mr-2 shrink-0 overflow-hidden"
            :class="user ? 'bg-blue-600' : 'bg-gray-500'"
          >
            <img v-if="user?.avatar" :src="user.avatar" class="w-full h-full object-cover" alt="Avatar" />
            <span v-else>{{ user?.username?.charAt(0).toUpperCase() || '?' }}</span>
          </div>
          <span class="text-sm font-medium truncate">{{ user?.name || user?.username || 'Guest' }}</span>
        </button>
        <button @click="emit('open-settings')" class="text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-white transition ml-2 cursor-pointer">
          <i class="fa-solid fa-gear"></i>
        </button>
      </div>
    </div>

    <!-- Search Modal -->
    <Teleport to="body">
      <div v-if="showSearchModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showSearchModal = false">
        <div class="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style="height: 80vh;">
          <!-- Modal Header -->
          <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 shrink-0">
            <h2 class="text-xl font-bold text-gray-800 dark:text-white">
              <i class="fa-solid fa-search mr-2"></i>搜尋
            </h2>
            <button @click="showSearchModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
              <i class="fa-solid fa-xmark text-xl"></i>
            </button>
          </div>

          <!-- Search Input -->
          <div class="p-4 border-b border-gray-300 dark:border-gray-700">
            <div class="relative">
              <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                v-model="searchQuery"
                ref="searchInput"
                type="text"
                placeholder="搜尋筆記和書本..."
                class="w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="flex flex-wrap items-center gap-4 mt-3">
              <label class="flex items-center text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input type="checkbox" v-model="includeContent" class="mr-2 w-4 h-4 accent-blue-600" />
                包含內文
              </label>

              <!-- Owner Filter -->
              <div class="flex items-center gap-1">
                <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-globe mr-1"></i>範圍：</span>
                <select v-model="searchOwnerFilter" @change="performSearch"
                        class="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                  <option value="all">全部</option>
                  <option value="my">我的</option>
                  <option value="public">公開</option>
                </select>
              </div>

              <!-- Date Range Filter -->
              <div class="flex items-center gap-1">
                <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-calendar mr-1"></i>日期：</span>
                <select v-model="searchDateRange" @change="performSearch"
                        class="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                  <option value="all">全部</option>
                  <option value="today">今天</option>
                  <option value="week">一週內</option>
                  <option value="month">一個月內</option>
                  <option value="year">一年內</option>
                  <option value="custom">自訂</option>
                </select>
              </div>
            </div>

            <!-- Custom Date Range Inputs -->
            <div v-if="searchDateRange === 'custom'" class="mt-3 flex flex-wrap items-center gap-3">
              <div class="flex items-center gap-1">
                <span class="text-sm text-gray-500 dark:text-gray-400">從：</span>
                <input type="date" v-model="searchDateStart" @change="performSearch"
                       class="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
              </div>
              <div class="flex items-center gap-1">
                <span class="text-sm text-gray-500 dark:text-gray-400">到：</span>
                <input type="date" v-model="searchDateEnd" @change="performSearch"
                       class="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
              </div>
              <button v-if="searchDateStart || searchDateEnd" @click="searchDateStart = ''; searchDateEnd = ''; performSearch()"
                      class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
                <i class="fa-solid fa-xmark"></i> 清除
              </button>
            </div>

            <!-- Tag Filter -->
            <div v-if="allTags.length > 0" class="mt-3 flex flex-wrap gap-1 items-center">
              <span class="text-sm text-gray-500 dark:text-gray-400"><i class="fa-solid fa-tags mr-1"></i>標籤：</span>
              <button v-for="tag in allTags" :key="tag" @click="toggleTag(tag)"
                      class="px-2 py-0.5 text-xs rounded-full transition cursor-pointer"
                      :class="selectedTag === tag
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-gray-600'">
                {{ tag }}
              </button>
              <button v-if="selectedTag" @click="selectedTag = ''; performSearch()"
                      class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
                <i class="fa-solid fa-xmark"></i> 清除
              </button>
            </div>
          </div>

          <!-- Search Results -->
          <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div v-if="searchLoading" class="text-center py-8 text-gray-500">
              <i class="fa-solid fa-spinner fa-spin text-2xl"></i>
            </div>
            <div v-else-if="searchResults.books.length === 0 && searchResults.notes.length === 0" class="text-center py-8 text-gray-500">
              {{ searchQuery || selectedTag ? '找不到符合的項目' : '輸入關鍵字開始搜尋' }}
            </div>
            <template v-else>
              <!-- Books -->
              <div v-if="searchResults.books.length > 0" class="mb-4">
                <h3 class="text-sm font-semibold text-gray-500 mb-2">書本 ({{ searchResults.books.length }})</h3>
                <div class="space-y-2">
                  <a
                    v-for="book in searchResults.books"
                    :key="book.id"
                    :href="'/b/' + book.id"
                    @click="showSearchModal = false"
                    class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border border-gray-100 dark:border-gray-700 transition group h-[70px]"
                  >
                    <!-- Icon -->
                    <div class="w-10 text-center text-xl mr-3 text-green-500 flex-shrink-0">
                      <i class="fa-solid fa-book"></i>
                    </div>

                    <!-- Main Info -->
                    <div class="flex-1 min-w-0">
                      <h3 class="font-bold text-gray-800 dark:text-white truncate text-base mb-1">
                        {{ book.title }}
                      </h3>
                      <!-- Tags -->
                      <div class="h-[20px] overflow-hidden">
                        <div v-if="book.tags && book.tags.length > 0" class="flex flex-wrap gap-1">
                          <span v-for="tag in book.tags.slice(0, 6)" :key="tag" class="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 flex-shrink-0">
                            {{ tag }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Date/User -->
                    <div class="text-right shrink-0 mr-2 text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                      <div>{{ formatDate(book.updatedAt) }}</div>
                      <div v-if="book.lastUpdater || book.owner">by {{ book.lastUpdater?.username || book.owner?.username }}</div>
                    </div>
                  </a>
                </div>
              </div>
              
              <!-- Notes -->
              <div v-if="searchResults.notes.length > 0">
                <h3 class="text-sm font-semibold text-gray-500 mb-2">筆記 ({{ searchResults.notes.length }})</h3>
                <div class="space-y-2">
                  <a
                    v-for="note in searchResults.notes"
                    :key="note.id"
                    :href="'/n/' + note.id"
                    @click="showSearchModal = false"
                    class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border border-gray-100 dark:border-gray-700 transition group h-[70px]"
                  >
                    <!-- Icon -->
                    <div class="w-10 text-center text-xl mr-3 text-blue-500 flex-shrink-0">
                      <i class="fa-solid fa-note-sticky"></i>
                    </div>

                    <!-- Main Info -->
                    <div class="flex-1 min-w-0">
                      <h3 class="font-bold text-gray-800 dark:text-white truncate text-base mb-1">
                        {{ note.title || 'Untitled' }}
                      </h3>
                      <!-- Tags -->
                      <div class="h-[20px] overflow-hidden">
                        <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1">
                          <span v-for="tag in note.tags.slice(0, 6)" :key="tag" class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex-shrink-0">
                            {{ tag }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Date/User -->
                    <div class="text-right shrink-0 mr-2 text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                      <div>{{ formatDate(note.updatedAt) }}</div>
                      <div v-if="note.lastEditor || note.owner">by {{ note.lastEditor?.username || note.owner?.username }}</div>
                    </div>
                  </a>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
