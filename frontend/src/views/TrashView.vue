<script setup>
/**
 * TrashView - 垃圾桶頁面
 */
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/composables/useApi'

const router = useRouter()
const route = useRoute()
const showAlert = inject('showAlert')
const showConfirm = inject('showConfirm')

// Inject global sidebar data from App.vue
const loadSidebarData = inject('loadSidebarData')

// Trash data (local state)
const loading = ref(true)
const books = ref([])
const notes = ref([])
const autoDeleteDays = ref(0)

// Load data (trash only - sidebar data is managed by App.vue)
const loadData = async () => {
  loading.value = true
  try {
    // Load sidebar data if not already loaded
    await loadSidebarData()
    
    // Load trash data (local to this view)
    const trashData = await api.getTrash()
    books.value = trashData.books || []
    notes.value = trashData.notes || []
    autoDeleteDays.value = trashData.autoDeleteDays || 0
  } catch (e) {
    console.error('Failed to load data:', e)
    showAlert?.('載入資料失敗', 'error')
  } finally {
    loading.value = false
  }
}

// Restore book
const restoreBook = async (bookId) => {
  try {
    await api.restoreBook(bookId)
    books.value = books.value.filter(b => b.id !== bookId)
    showAlert?.('書本已還原', 'success')
  } catch (e) {
    showAlert?.('還原失敗：' + e.message, 'error')
  }
}

// Force delete book
const forceDeleteBook = async (bookId) => {
  const confirmed = await showConfirm?.('確定要永久刪除此書本？此操作無法復原。')
  if (!confirmed) return
  
  try {
    await api.forceDeleteBook(bookId)
    books.value = books.value.filter(b => b.id !== bookId)
    showAlert?.('書本已永久刪除', 'success')
  } catch (e) {
    showAlert?.('刪除失敗：' + e.message, 'error')
  }
}

// Restore note
const restoreNote = async (noteId) => {
  try {
    await api.restoreNote(noteId)
    notes.value = notes.value.filter(n => n.id !== noteId)
    showAlert?.('筆記已還原', 'success')
  } catch (e) {
    showAlert?.('還原失敗：' + e.message, 'error')
  }
}

// Force delete note
const forceDeleteNote = async (noteId) => {
  const confirmed = await showConfirm?.('確定要永久刪除此筆記？此操作無法復原。')
  if (!confirmed) return
  
  try {
    await api.forceDeleteNote(noteId)
    notes.value = notes.value.filter(n => n.id !== noteId)
    showAlert?.('筆記已永久刪除', 'success')
  } catch (e) {
    showAlert?.('刪除失敗：' + e.message, 'error')
  }
}

// Format date
const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-TW')
}

onMounted(loadData)
</script>

<template>
  <div class="h-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text container mx-auto px-8 py-5 flex-1 overflow-y-auto">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
    </div>

    <!-- Content -->
    <div v-else class="h-full">
      <!-- Header -->
      <div class="mb-6 flex items-center text-gray-500 dark:text-gray-400">
        <router-link to="/" class="hover:text-blue-500">Home</router-link>
        <span class="mx-2">/</span>
        <span>垃圾桶</span>
      </div>

      <h1 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center">
        <i class="fa-solid fa-trash-can mr-3"></i> 垃圾桶
      </h1>
      <p v-if="autoDeleteDays > 0" class="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-8">
        <i class="fa-solid fa-circle-info mr-1"></i>
        垃圾桶內的書本、筆記會在 {{ autoDeleteDays }} 天後自動永久刪除
      </p>
      <div v-else class="mb-8"></div>

      <!-- Content Grid -->
      <div>
        <!-- Deleted Books -->
        <div class="mb-8">
            <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">已刪除的 Books</h2>
            <div v-if="books.length === 0" class="text-gray-400 italic">(無已刪除的 Book)</div>
            <div v-else class="bg-white dark:bg-dark-surface rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
                <div v-for="book in books" :key="book.id" class="p-4 border-b border-gray-300 dark:border-gray-700 last:border-b-0 flex justify-between items-center">
                    <div class="flex-1 min-w-0 mr-4">
                        <div class="flex items-center">
                            <span class="mr-3 text-gray-400 shrink-0"><i class="fa-solid fa-book"></i></span>
                            <span class="font-medium text-lg text-gray-800 dark:text-gray-200 truncate" :title="book.title">{{ book.title }}</span>
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-8">
                            <span>刪除時間: {{ formatDate(book.deletedAt) }}</span>
                            <span v-if="book.deletedBy" class="ml-3">刪除者: {{ book.deletedBy.username }}</span>
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <button @click="restoreBook(book.id)" class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition" title="還原">
                            <i class="fa-solid fa-rotate-left mr-1"></i> 還原
                        </button>
                        <button @click="forceDeleteBook(book.id)" class="px-3 py-1 text-sm bg-transparent text-red-500 hover:bg-red-600 hover:text-white rounded border border-red-600 transition" title="永久刪除">
                            <i class="fa-solid fa-trash mr-1"></i> 永久刪除
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Deleted Notes -->
        <div>
            <h2 class="text-lg font-bold mb-4 text-gray-700 dark:text-gray-300">已刪除的 Notes</h2>
            <div v-if="notes.length === 0" class="text-gray-400 italic">(無已刪除的 Note)</div>
            <div v-else class="bg-white dark:bg-dark-surface rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
                <div v-for="note in notes" :key="note.id" class="p-4 border-b border-gray-300 dark:border-gray-700 last:border-b-0 flex justify-between items-center">
                    <div class="flex-1 min-w-0 mr-4">
                        <div class="flex items-center">
                            <span class="mr-3 text-gray-400 shrink-0"><i class="fa-solid fa-note-sticky"></i></span>
                            <span class="font-medium text-lg text-gray-800 dark:text-gray-200 truncate" :title="note.title">{{ note.title }}</span>
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-8">
                            <span>刪除時間: {{ formatDate(note.deletedAt) }}</span>
                            <span v-if="note.deletedBy" class="ml-3">刪除者: {{ note.deletedBy.username }}</span>
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <button @click="restoreNote(note.id)" class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition" title="還原">
                            <i class="fa-solid fa-rotate-left mr-1"></i> 還原
                        </button>
                        <button @click="forceDeleteNote(note.id)" class="px-3 py-1 text-sm bg-transparent text-red-500 hover:bg-red-600 hover:text-white rounded border border-red-600 transition" title="永久刪除">
                            <i class="fa-solid fa-trash mr-1"></i> 永久刪除
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>
