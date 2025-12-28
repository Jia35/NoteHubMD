<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/composables/useApi'
import { SidebarNav } from '@/components'

const router = useRouter()
const route = useRoute()
const showAlert = inject('showAlert')

// Inject global sidebar data from App.vue
const user = inject('sidebarUser')
const books = inject('sidebarBooks')
const pinnedItems = inject('sidebarPinnedItems')
const loadSidebarData = inject('loadSidebarData')
const updateSidebarPinnedItems = inject('updateSidebarPinnedItems')

const globalViewMode = ref(localStorage.getItem('NoteHubMD-viewMode') || 'my')
const currentRoute = computed(() => route.path)

// Settings Modal
const showSettings = ref(false)
const showUserProfileModal = ref(false)
const showCreateBookModal = ref(false)

// Admin state (local)
const users = ref([])
const loading = ref(true)
const isAdmin = ref(false)

// Filtered sidebar books
const filteredSidebarBooks = computed(() => {
  if (globalViewMode.value === 'my') {
    return books.value.filter(book => book.isOwner)
  }
  return books.value.filter(book => book.isPublic)
})
const limitedSidebarBooks = computed(() => filteredSidebarBooks.value.slice(0, 20))
const hasMoreBooks = computed(() => filteredSidebarBooks.value.length > 20)

// Format date time
const formatDateTime = (dateStr) => {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Format relative time
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '剛剛'
  if (diffMins < 60) return `${diffMins} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  if (diffDays < 7) return `${diffDays} 天前`
  return formatDateTime(dateStr)
}

// Check if current user can change role of target user
const canChangeRole = (targetUser) => {
  if (targetUser.id === user.value?.id) return false
  if (user.value?.role === 'super-admin') return true
  if (user.value?.role === 'admin' && targetUser.role !== 'super-admin') return true
  return false
}

// Update user role
const updateRole = async (targetUser) => {
  try {
    const response = await fetch(`/api/admin/users/${targetUser.id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: targetUser.role })
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error)
    }
  } catch (e) {
    showAlert?.('更新失敗：' + e.message, 'error')
    loadData()
  }
}

// Load data (admin-specific - sidebar data is managed by App.vue)
const loadData = async () => {
  loading.value = true
  try {
    // Load sidebar data if not already loaded
    await loadSidebarData()
    
    // Check if current user is admin
    isAdmin.value = user.value?.role === 'super-admin' || user.value?.role === 'admin'

    if (!isAdmin.value) {
      loading.value = false
      return
    }

    // Fetch users (admin-specific data)
    const response = await fetch('/api/admin/users')
    if (!response.ok) throw new Error('Failed to load users')
    users.value = await response.json()
  } catch (e) {
    console.error('Failed to load admin data', e)
    isAdmin.value = false
  } finally {
    loading.value = false
  }
}

// Sidebar handlers
const setGlobalViewMode = (mode) => {
  globalViewMode.value = mode
  localStorage.setItem('NoteHubMD-viewMode', mode)
}

const unpinItem = async (type, id) => {
  try {
    await api.removePin(type, id)
    // Update global pinned items
    const updatedItems = pinnedItems.value.filter(p => !(p.type === type && p.id === id))
    updateSidebarPinnedItems(updatedItems)
  } catch (e) {
    showAlert?.('取消釘選失敗', 'error')
  }
}

const createNote = async () => {
  try {
    const note = await api.createNote()
    window.location.href = '/n/' + note.id
  } catch (e) {
    showAlert?.('建立筆記失敗', 'error')
  }
}

onMounted(loadData)
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
      @create-book="showCreateBookModal = true"
      @open-profile="showUserProfileModal = true"
      @open-settings="showSettings = true"
    />

    <!-- Main Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="px-8 py-5 container mx-auto">
        <!-- Breadcrumb -->
        <div class="mb-6 flex items-center text-gray-500 dark:text-gray-400">
          <router-link to="/" class="hover:text-blue-500">Home</router-link>
          <span class="mx-2">/</span>
          <span>管理後台</span>
        </div>

        <h1 class="text-3xl font-bold mb-8 text-gray-800 dark:text-white flex items-center">
          <i class="fa-solid fa-user-shield mr-3"></i> 管理後台
        </h1>

        <!-- Loading -->
        <div v-if="loading" class="text-gray-500 dark:text-gray-400">
          <i class="fa-solid fa-spinner fa-spin mr-2"></i> 載入中...
        </div>

        <!-- Access Denied -->
        <div v-else-if="!isAdmin" class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
          <i class="fa-solid fa-ban mr-2"></i> 您沒有權限進入此頁面
        </div>

        <!-- Admin Content -->
        <div v-else>
          <h2 class="text-xl font-bold mb-4 text-gray-700 dark:text-gray-300">
            <i class="fa-solid fa-users mr-2"></i> 使用者列表
          </h2>

          <div class="bg-white dark:bg-dark-surface rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
            <table class="w-full">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">使用者</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">身分</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">加入時間</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">上次活動</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">書/筆記</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="u in users" :key="u.id" class="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ u.id }}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center">
                      <div class="w-8 h-8 rounded-full flex items-center justify-center mr-3 shrink-0 overflow-hidden bg-blue-600 text-white text-sm">
                        <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover" alt="">
                        <span v-else>{{ u.username?.charAt(0).toUpperCase() }}</span>
                      </div>
                      <div>
                        <div class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ u.name || u.username }}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">@{{ u.username }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <select v-if="canChangeRole(u)"
                            v-model="u.role"
                            @change="updateRole(u)"
                            class="text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200 cursor-pointer">
                      <option value="super-admin" :disabled="user?.role !== 'super-admin'">super-admin</option>
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </select>
                    <span v-else class="text-sm px-2 py-1 rounded"
                          :class="{
                            'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300': u.role === 'super-admin',
                            'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300': u.role === 'admin',
                            'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300': u.role === 'user'
                          }">
                      {{ u.role }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {{ formatDateTime(u.createdAt) }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {{ u.lastActiveAt ? formatRelativeTime(u.lastActiveAt) : '從未' }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    <span class="mr-2"><i class="fa-solid fa-book mr-1"></i>{{ u.bookCount }}</span>
                    <span><i class="fa-solid fa-note-sticky mr-1"></i>{{ u.noteCount }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
