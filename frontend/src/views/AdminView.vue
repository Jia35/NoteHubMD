<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/composables/useApi'

const router = useRouter()
const route = useRoute()
const showAlert = inject('showAlert')

// Inject global sidebar data from App.vue
const user = inject('sidebarUser')
const loadSidebarData = inject('loadSidebarData')

// Admin state (local)
const users = ref([])
const loading = ref(true)
const isAdmin = ref(false)

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


onMounted(loadData)
</script>

<template>
  <div class="h-full bg-gray-100 dark:bg-dark-bg text-gray-900 dark:text-dark-text container mx-auto px-8 py-5 flex-1 overflow-y-auto">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <i class="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i>
    </div>

    <!-- Admin Content -->
    <div v-else class="h-full">
      <div v-if="isAdmin">
        <!-- Header -->
        <div class="mb-6">
          <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
            <router-link to="/" class="hover:text-blue-500">Home</router-link>
            <span class="mx-2">/</span>
            <span class="text-gray-800 dark:text-white font-medium">系統管理</span>
          </div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-3">
            <i class="fa-solid fa-user-shield text-purple-600"></i>
            系統管理
          </h1>
        </div>

        <!-- System Stats (Mockup) -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-gray-500 dark:text-gray-400 font-medium">總用戶數</h3>
              <i class="fa-solid fa-users text-blue-500 text-xl"></i>
            </div>
            <p class="text-2xl font-bold text-gray-800 dark:text-white">{{ users.length }}</p>
          </div>
          <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-gray-500 dark:text-gray-400 font-medium">線上用戶</h3>
              <i class="fa-solid fa-circle text-green-500 text-xl"></i>
            </div>
            <p class="text-2xl font-bold text-gray-800 dark:text-white">1</p>
          </div>
          <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-gray-500 dark:text-gray-400 font-medium">資料庫狀態</h3>
              <i class="fa-solid fa-database text-purple-500 text-xl"></i>
            </div>
            <p class="text-2xl font-bold text-gray-800 dark:text-white">正常</p>
          </div>
        </div>

        <!-- User Management -->
        <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-xl font-bold text-gray-800 dark:text-white">用戶管理</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm uppercase">
                  <th class="px-6 py-3 font-semibold">用戶</th>
                  <th class="px-6 py-3 font-semibold">角色</th>
                  <th class="px-6 py-3 font-semibold">狀態</th>
                  <th class="px-6 py-3 font-semibold">最後登入</th>
                  <th class="px-6 py-3 font-semibold">註冊時間</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="u in users" :key="u.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition0">
                  <td class="px-6 py-4">
                    <div class="flex items-center">
                      <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden text-white text-xs mr-3"
                            :class="u.username === 'admin' ? 'bg-purple-600' : 'bg-blue-600'">
                        <img v-if="u.avatar" :src="u.avatar" class="w-full h-full object-cover">
                        <span v-else>{{ u.username.charAt(0).toUpperCase() }}</span>
                      </div>
                      <div>
                        <div class="font-medium text-gray-900 dark:text-gray-100">{{ u.name || u.username }}</div>
                        <div class="text-xs text-gray-500">{{ u.username }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <select 
                      v-model="u.role" 
                      @change="updateRole(u)"
                      :disabled="!canChangeRole(u)"
                      class="bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="super-admin" :disabled="user?.role !== 'super-admin'">Super Admin</option>
                    </select>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                      Active
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400" :title="formatDateTime(u.lastActiveAt)">
                    {{ formatRelativeTime(u.lastActiveAt) }}
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {{ formatDateTime(u.createdAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Unauthorized -->
      <div v-else class="flex items-center justify-center h-full">
        <div class="text-center">
          <i class="fa-solid fa-lock text-6xl text-gray-300 mb-4"></i>
          <h2 class="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">權限不足</h2>
          <p class="text-gray-500">您沒有權限訪問此頁面。</p>
          <router-link to="/" class="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            回首頁
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
