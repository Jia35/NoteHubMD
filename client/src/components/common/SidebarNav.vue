<script setup>
import { ref, watch, nextTick } from 'vue'
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

const emit = defineEmits(['unpin', 'view-mode-change', 'create-note', 'create-book', 'open-profile', 'open-settings'])

// Search Modal state
const showSearchModal = ref(false)
const searchQuery = ref('')
const includeContent = ref(false)
const searchLoading = ref(false)
const searchResults = ref({ books: [], notes: [] })
const searchInput = ref(null)
const allTags = ref([])
const selectedTag = ref('')
const searchOwnerFilter = ref('all')
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
  searchOwnerFilter.value = 'all'
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

    <!-- View Mode Toggle -->
    <div class="px-3 pt-3 pb-1">
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

    <!-- Search & Create Buttons -->
    <div class="p-3 space-y-2 border-b border-gray-200 dark:border-gray-800">
      <button
        @click="openSearchModal"
        class="w-full bg-gray-300 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition flex items-center justify-center text-sm cursor-pointer"
      >
        <i class="fa-solid fa-search mr-2"></i> 搜尋
      </button>
      <button
        @click="emit('create-note')"
        class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center text-sm cursor-pointer"
      >
        <i class="fa-solid fa-plus mr-1"></i><i class="fa-solid fa-note-sticky mr-1"></i> 新增筆記
      </button>
      <button
        @click="emit('create-book')"
        class="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center justify-center text-sm cursor-pointer"
      >
        <i class="fa-solid fa-plus mr-1"></i><i class="fa-solid fa-book mr-1"></i> 新增書本
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

      <!-- Pinned Items -->
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
            class="w-8 h-8 rounded-full flex items-center justify-center mr-2 shrink-0 overflow-hidden"
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
        <div class="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style="max-height: 80vh;">
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
            </div>
          </div>

          <!-- Search Results -->
          <div class="flex-1 overflow-y-auto p-4">
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
                    class="block p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <div class="flex items-center">
                      <i class="fa-solid fa-book text-green-500 mr-2"></i>
                      <span class="font-medium text-gray-800 dark:text-white">{{ book.title }}</span>
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
                    class="block p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <div class="flex items-center">
                      <i class="fa-solid fa-note-sticky text-blue-500 mr-2"></i>
                      <span class="font-medium text-gray-800 dark:text-white">{{ note.title || 'Untitled' }}</span>
                    </div>
                    <p class="text-sm text-gray-500 mt-1">{{ formatDate(note.updatedAt) }}</p>
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
