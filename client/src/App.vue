<script setup>
import { ref, provide, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import api from '@/composables/useApi'

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

const updateSidebarUser = (user) => {
  sidebarUser.value = user
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

// Apply theme on mount
onMounted(() => {
  const theme = localStorage.getItem('NoteHubMD-theme') || 'dark'
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
})
</script>

<template>
  <RouterView />

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
