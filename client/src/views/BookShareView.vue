<script setup>
/**
 * BookShareView - 書本分享頁 (唯讀檢視)
 */
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()

// Book data
const loading = ref(true)
const error = ref('')
const book = ref(null)
const notes = ref([])
const canEdit = ref(false)

// Load book
const loadBook = async () => {
  loading.value = true
  error.value = ''
  try {
    const shareId = route.params.shareId
    const data = await api.getSharedBook(shareId)
    
    // Normalize API response: Map Notes (capitalized) to notes (lowercase)
    if (data.Notes) {
      data.notes = data.Notes
      delete data.Notes
    }
    
    book.value = data
    notes.value = data.notes || []
    canEdit.value = data.canEdit || false
    
    document.title = `${data.title?.substring(0, 30) || 'Book'} | NoteHubMD`
  } catch (e) {
    console.error('Failed to load book:', e)
    error.value = e.message || '無法載入書本'
  } finally {
    loading.value = false
  }
}

// Get share link for a note
const getNoteShareLink = (note) => {
  return note.shareId ? `/s/${note.shareId}` : `/n/${note.id}`
}

// Format date
const formatDate = (date) => {
  return date ? dayjs(date).format('YYYY/MM/DD HH:mm') : '-'
}

onMounted(() => {
  loadBook()
})

watch(() => route.params.shareId, () => {
  loadBook()
})
</script>

<template>
  <div class="bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text min-h-screen">
    <!-- Header -->
    <header class="bg-white dark:bg-dark-surface border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <router-link to="/" class="flex items-center">
          <img src="@/assets/images/logo.png" alt="NoteHubMD" class="w-8 h-8 mr-3">
          <span class="font-bold text-lg tracking-wide">NoteHubMD</span>
        </router-link>
        <div class="flex items-center space-x-3">
          <span v-if="canEdit" class="text-xs text-gray-500 dark:text-gray-400">
            <i class="fa-solid fa-pen-to-square mr-1"></i>可編輯
          </span>
          <a 
            v-if="book?.id" 
            :href="'/b/' + book.id"
            class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            <i class="fa-solid fa-edit mr-1"></i>編輯
          </a>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-96">
      <i class="fa-solid fa-spinner fa-spin text-4xl text-gray-400"></i>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="max-w-2xl mx-auto px-4 py-16 text-center">
      <i class="fa-solid fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
      <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">無法載入書本</h2>
      <p class="text-gray-600 dark:text-gray-400">{{ error }}</p>
      <router-link to="/" class="inline-block mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        <i class="fa-solid fa-home mr-2"></i>返回首頁
      </router-link>
    </div>

    <!-- Book Content -->
    <div v-else-if="book" class="max-w-4xl mx-auto px-4 py-8">
      <!-- Book Header -->
      <div class="bg-white dark:bg-dark-surface rounded-lg shadow-lg p-6 mb-6">
        <div class="flex items-start">
          <div class="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-4 shrink-0">
            <i class="fa-solid fa-book text-green-600 dark:text-green-400 text-2xl"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">{{ book.title }}</h1>
            <p v-if="book.description" class="text-gray-600 dark:text-gray-400 mb-3">{{ book.description }}</p>
            
            <!-- Tags -->
            <div v-if="book.tags?.length > 0" class="flex flex-wrap gap-2 mb-3">
              <span 
                v-for="tag in book.tags" 
                :key="tag"
                class="px-3 py-1 text-sm rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1"><i class="fa-solid fa-user mr-1"></i>建立者</div>
            <div class="flex items-center">
              <span v-if="book.owner?.avatar" class="w-6 h-6 rounded-full overflow-hidden mr-2">
                <img :src="book.owner.avatar" class="w-full h-full object-cover">
              </span>
              <span class="text-gray-700 dark:text-gray-300">{{ book.owner?.username || '(未知)' }}</span>
            </div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1"><i class="fa-solid fa-calendar mr-1"></i>建立時間</div>
            <div class="text-gray-700 dark:text-gray-300">{{ formatDate(book.createdAt) }}</div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1"><i class="fa-solid fa-pen mr-1"></i>最後更新者</div>
            <div class="flex items-center">
              <span v-if="book.lastUpdater?.avatar" class="w-6 h-6 rounded-full overflow-hidden mr-2">
                <img :src="book.lastUpdater.avatar" class="w-full h-full object-cover">
              </span>
              <span class="text-gray-700 dark:text-gray-300">{{ book.lastUpdater?.username || book.owner?.username || '(未知)' }}</span>
            </div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1"><i class="fa-solid fa-clock mr-1"></i>最後更新</div>
            <div class="text-gray-700 dark:text-gray-300">{{ formatDate(book.updatedAt) }}</div>
          </div>
        </div>
      </div>

      <!-- Notes List -->
      <div class="bg-white dark:bg-dark-surface rounded-lg shadow-lg overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-bold text-gray-800 dark:text-white">
            <i class="fa-solid fa-list-ul mr-2"></i>筆記目錄
          </h2>
          <span class="text-sm text-gray-500 dark:text-gray-400">{{ notes.length }} 篇筆記</span>
        </div>

        <div v-if="notes.length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
          <i class="fa-solid fa-folder-open text-4xl mb-2"></i>
          <p>這本書裡還沒有筆記。</p>
        </div>

        <div v-else>
          <a 
            v-for="(note, index) in notes" 
            :key="note.id" 
            :href="getNoteShareLink(note)"
            class="block p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <div class="flex items-center">
              <span class="w-8 shrink-0 text-center text-gray-400 text-sm">{{ index + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-gray-800 dark:text-gray-200 truncate">{{ note.title || 'Untitled' }}</div>
                <!-- Tags -->
                <div v-if="note.tags?.length > 0" class="flex flex-wrap gap-1 mt-1">
                  <span 
                    v-for="tag in note.tags.slice(0, 3)" 
                    :key="tag"
                    class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                  >
                    {{ tag }}
                  </span>
                  <span 
                    v-if="note.tags.length > 3"
                    class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    +{{ note.tags.length - 3 }}
                  </span>
                </div>
              </div>
              <div class="text-right shrink-0 ml-4 text-xs text-gray-500 dark:text-gray-400">
                <div>{{ formatDate(note.lastEditedAt || note.updatedAt) }}</div>
                <div v-if="note.lastEditor">by {{ note.lastEditor.username }}</div>
              </div>
              <i class="fa-solid fa-chevron-right ml-3 text-gray-400"></i>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
