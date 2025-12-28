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
      <div class="mb-6">
        <!-- Breadcrumb -->
        <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
          <router-link to="/" class="hover:text-blue-500">Home</router-link>
          <span class="mx-2">/</span>
          <span class="text-gray-800 dark:text-white font-medium">垃圾桶</span>
        </div>

        <h1 class="text-3xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-3">
          <i class="fa-solid fa-trash-alt text-red-600"></i>
          垃圾桶
        </h1>
        <p class="text-gray-600 dark:text-gray-400">這裡顯示已刪除的書本和筆記，您可以還原或永久刪除它們。</p>
      </div>

      <!-- Content Grid -->
      <div class="space-y-8">
        <!-- Deleted Books -->
        <div v-if="books.length > 0">
          <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-300 dark:border-gray-700 pb-2">
            <i class="fa-solid fa-book mr-2"></i>已刪除的書本 ({{ books.length }})
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="book in books" :key="book.id" class="bg-white dark:bg-dark-surface p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg text-gray-800 dark:text-white truncate flex-1" :title="book.title">{{ book.title }}</h3>
                <span class="text-xs text-gray-400 whitespace-nowrap ml-2">{{ formatDate(book.deletedAt) }}</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 h-10">{{ book.description || '無描述' }}</p>
              <div class="flex justify-end gap-2">
                <button @click="restoreBook(book.id)" class="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200 transition cursor-pointer">
                  <i class="fa-solid fa-rotate-left mr-1"></i>還原
                </button>
                <button @click="forceDeleteBook(book.id)" class="text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200 transition cursor-pointer">
                  <i class="fa-solid fa-trash-can mr-1"></i>永久刪除
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Deleted Notes -->
        <div v-if="notes.length > 0">
          <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-300 dark:border-gray-700 pb-2">
            <i class="fa-solid fa-note-sticky mr-2"></i>已刪除的筆記 ({{ notes.length }})
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="note in notes" :key="note.id" class="bg-white dark:bg-dark-surface p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-800 dark:text-white truncate flex-1" :title="note.title">{{ note.title || 'Untitled' }}</h3>
              </div>
              <div class="text-xs text-gray-500 mb-4">
                <div v-if="note.Book">書本: {{ note.Book.title }}</div>
                <div>刪除於: {{ formatDate(note.deletedAt) }}</div>
              </div>
              <div class="flex justify-end gap-2">
                <button @click="restoreNote(note.id)" class="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded hover:bg-green-200 transition cursor-pointer">
                  <i class="fa-solid fa-rotate-left mr-1"></i>還原
                </button>
                <button @click="forceDeleteNote(note.id)" class="text-sm bg-red-100 text-red-700 px-3 py-1.5 rounded hover:bg-red-200 transition cursor-pointer">
                  <i class="fa-solid fa-trash-can mr-1"></i>永久刪除
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="books.length === 0 && notes.length === 0" class="text-center py-12">
          <i class="fa-regular fa-trash-can text-6xl text-gray-300 mb-4"></i>
          <p class="text-gray-500 dark:text-gray-400">垃圾桶是空的</p>
        </div>
      </div>
    </div>
  </div>
</template>
