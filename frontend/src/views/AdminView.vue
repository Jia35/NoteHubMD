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
const stats = ref(null)
const loading = ref(true)
const isAdmin = ref(false)

// Tab state
const activeTab = ref('overview')

// System management state
const systemConfig = ref(null)
const storageStats = ref(null)
const loadingStorage = ref(false)

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

// Format file size
const formatSize = (bytes) => {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
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

// Load system config
const loadSystemConfig = async () => {
  try {
    const response = await fetch('/api/admin/system')
    if (response.ok) {
      systemConfig.value = await response.json()
    }
  } catch (e) {
    console.error('Failed to load system config', e)
  }
}

// Load storage stats
const loadStorageStats = async () => {
  loadingStorage.value = true
  try {
    const response = await fetch('/api/admin/storage')
    if (response.ok) {
      storageStats.value = await response.json()
    }
  } catch (e) {
    console.error('Failed to load storage stats', e)
  } finally {
    loadingStorage.value = false
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
    
    // Fetch stats
    const statsResponse = await fetch('/api/admin/stats')
    if (statsResponse.ok) {
      stats.value = await statsResponse.json()
    }

    // Load system config
    await loadSystemConfig()
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
            <span class="text-gray-800 dark:text-white font-medium">系統管理後台</span>
          </div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-3">
            <i class="fa-solid fa-user-shield"></i>
            系統管理後台
          </h1>

          <!-- Tabs -->
          <div class="flex border-b border-gray-300 dark:border-gray-600">
            <button 
              @click="activeTab = 'overview'"
              class="px-4 py-2 font-medium text-sm transition-colors"
              :class="activeTab === 'overview' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            >
              <i class="fa-solid fa-chart-pie mr-2"></i>總覽
            </button>
            <button 
              @click="activeTab = 'system'; loadStorageStats()"
              class="px-4 py-2 font-medium text-sm transition-colors"
              :class="activeTab === 'system' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            >
              <i class="fa-solid fa-gear mr-2"></i>系統管理
            </button>
          </div>
        </div>

        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'">
          <!-- System Stats -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-gray-500 dark:text-gray-400 font-medium">總使用者數</h3>
                <i class="fa-solid fa-users text-blue-500 text-xl"></i>
              </div>
              <p class="text-2xl font-bold text-gray-800 dark:text-white">{{ users.length }}</p>
            </div>
            <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-gray-500 dark:text-gray-400 font-medium">線上使用者</h3>
                <i class="fa-solid fa-circle text-green-500 text-xl"></i>
              </div>
              <p class="text-2xl font-bold text-gray-800 dark:text-white">{{ stats?.onlineUsers ?? '—' }}</p>
            </div>
            <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-gray-500 dark:text-gray-400 font-medium">資料庫狀態</h3>
                <i class="fa-solid fa-database text-purple-500 text-xl"></i>
              </div>
              <p class="text-2xl font-bold text-gray-800 dark:text-white">正常</p>
            </div>
          </div>

          <!-- Notes Management -->
          <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-xl font-bold text-gray-800 dark:text-white">筆記管理</h2>
            </div>
            <div class="px-6 py-4" v-if="stats">
              <div class="grid grid-cols-3 gap-6">
                <div class="flex items-center">
                  <i class="fa-solid fa-book text-blue-500 text-2xl mr-4"></i>
                  <div>
                    <div class="flex items-baseline">
                      <span class="text-2xl font-bold text-gray-800 dark:text-white">{{ stats.active.books }}</span>
                      <span class="text-sm text-gray-500 ml-2">(<i class="fa-solid fa-trash-can text-xs"></i> {{ stats.trash.books }})</span>
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">書本</div>
                  </div>
                </div>
                <div class="flex items-center">
                  <i class="fa-solid fa-note-sticky text-green-500 text-2xl mr-4"></i>
                  <div>
                    <div class="flex items-baseline">
                      <span class="text-2xl font-bold text-gray-800 dark:text-white">{{ stats.active.standaloneNotes }}</span>
                      <span class="text-sm text-gray-500 ml-2">(<i class="fa-solid fa-trash-can text-xs"></i> {{ stats.trash.standaloneNotes }})</span>
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">獨立筆記</div>
                  </div>
                </div>
                <div class="flex items-center">
                  <i class="fa-solid fa-file-lines text-purple-500 text-2xl mr-4"></i>
                  <div>
                    <div class="flex items-baseline">
                      <span class="text-2xl font-bold text-gray-800 dark:text-white">{{ stats.active.totalNotes }}</span>
                      <span class="text-sm text-gray-500 ml-2">(<i class="fa-solid fa-trash-can text-xs"></i> {{ stats.trash.totalNotes }})</span>
                    </div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">全部筆記</div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="px-6 py-4 text-center text-gray-400">
              <i class="fa-solid fa-spinner fa-spin"></i> 載入中...
            </div>
          </div>

          <!-- User Management -->
          <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-xl font-bold text-gray-800 dark:text-white">使用者管理</h2>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm uppercase">
                    <th class="px-6 py-3 font-semibold">使用者</th>
                    <th class="px-6 py-3 font-semibold">角色</th>
                    <th class="px-6 py-3 font-semibold">內容</th>
                    <th class="px-6 py-3 font-semibold">上次活動</th>
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
                          <div class="text-xs text-gray-500">@{{ u.username }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <select 
                        v-model="u.role" 
                        @change="updateRole(u)"
                        :disabled="!canChangeRole(u)"
                        class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <option value="super-admin" class="bg-white dark:bg-gray-800" :disabled="user?.role !== 'super-admin'">Super Admin</option>
                        <option value="admin" class="bg-white dark:bg-gray-800">Admin</option>
                        <option value="user" class="bg-white dark:bg-gray-800">User</option>
                      </select>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span class="flex items-center gap-1" :title="(u.bookCount || 0) + ' 本書本'">
                          <i class="fa-solid fa-book text-green-500"></i>
                          {{ u.bookCount || 0 }}
                        </span>
                        <span class="flex items-center gap-1" :title="(u.noteCount || 0) + ' 篇筆記'">
                          <i class="fa-solid fa-note-sticky text-blue-500"></i>
                          {{ u.noteCount || 0 }}
                        </span>
                      </div>
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

        <!-- System Management Tab -->
        <div v-if="activeTab === 'system'">
          <!-- System Config -->
          <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-xl font-bold text-gray-800 dark:text-white">
                <i class="fa-solid fa-sliders mr-2"></i>系統設定
              </h2>
            </div>
            <div class="px-6 py-4" v-if="systemConfig">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Features -->
                <div class="space-y-3">
                  <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">功能開關</h3>
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span class="text-gray-700 dark:text-gray-300">留言功能</span>
                    <span :class="systemConfig.features.comments.value ? 'text-green-500' : 'text-gray-400'">
                      <i :class="systemConfig.features.comments.value ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-minus'"></i>
                      {{ systemConfig.features.comments.value ? '開啟' : '停用' }}
                      <span v-if="!systemConfig.features.comments.isSet" class="text-gray-400 text-xs ml-1">(預設)</span>
                    </span>
                  </div>
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span class="text-gray-700 dark:text-gray-300">筆記表情回饋</span>
                    <span :class="systemConfig.features.noteReactions.value ? 'text-green-500' : 'text-gray-400'">
                      <i :class="systemConfig.features.noteReactions.value ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-minus'"></i>
                      {{ systemConfig.features.noteReactions.value ? '開啟' : '停用' }}
                      <span v-if="!systemConfig.features.noteReactions.isSet" class="text-gray-400 text-xs ml-1">(預設)</span>
                    </span>
                  </div>
                </div>
                <!-- Defaults -->
                <div class="space-y-3">
                  <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">預設權限</h3>
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span class="text-gray-700 dark:text-gray-300">預設筆記權限</span>
                    <span class="text-blue-500 font-mono">
                      {{ systemConfig.defaults.notePermission?.value }}
                      <span v-if="systemConfig.defaults.notePermission?.isSet === false" class="text-gray-400 text-xs font-sans ml-1">(預設)</span>
                    </span>
                  </div>
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span class="text-gray-700 dark:text-gray-300">預設書本權限</span>
                    <span class="text-blue-500 font-mono">
                      {{ systemConfig.defaults.bookPermission?.value }}
                      <span v-if="systemConfig.defaults.bookPermission?.isSet === false" class="text-gray-400 text-xs font-sans ml-1">(預設)</span>
                    </span>
                  </div>
                </div>
                <!-- Webhook -->
                <div class="space-y-3">
                  <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Webhook</h3>
                  <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-gray-700 dark:text-gray-300">留言 Webhook</span>
                      <span :class="systemConfig.webhook.commentUrl ? 'text-green-500' : 'text-gray-400'">
                        <i :class="systemConfig.webhook.commentUrl ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-minus'"></i>
                        {{ systemConfig.webhook.commentUrl ? '已設定' : '不觸發' }}
                      <span v-if="!systemConfig.webhook.commentUrl" class="text-gray-400 text-xs font-sans ml-1">(預設)</span>
                      </span>
                    </div>
                    <div v-if="systemConfig.webhook.commentUrl" class="text-xs text-gray-500 font-mono truncate" :title="systemConfig.webhook.commentUrl">
                      {{ systemConfig.webhook.commentUrl }}
                    </div>
                  </div>
                </div>
                <!-- LDAP -->
                <div class="space-y-3">
                  <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">認證</h3>
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span class="text-gray-700 dark:text-gray-300">LDAP 認證</span>
                    <span :class="systemConfig.ldap.enabled ? 'text-green-500' : 'text-gray-400'">
                      <i :class="systemConfig.ldap.enabled ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-minus'"></i>
                      {{ systemConfig.ldap.enabled ? '啟用' : '停用' }}
                    </span>
                  </div>
                </div>
              </div>
              <p class="text-xs text-gray-400 mt-4">
                <i class="fa-solid fa-info-circle mr-1"></i>
                系統設定需修改 <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">.env</code> 並重啟伺服器才能生效
              </p>
            </div>
            <div v-else class="px-6 py-4 text-center text-gray-400">
              <i class="fa-solid fa-spinner fa-spin"></i> 載入中...
            </div>
          </div>

          <!-- Storage Stats -->
          <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 class="text-xl font-bold text-gray-800 dark:text-white">
                <i class="fa-solid fa-hard-drive mr-2"></i>儲存空間統計
              </h2>
            </div>
            <div class="px-6 py-4" v-if="storageStats">
              <!-- Summary Cards -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div class="flex items-center gap-3">
                    <i class="fa-solid fa-images text-blue-500 text-2xl"></i>
                    <div>
                      <div class="text-2xl font-bold text-gray-800 dark:text-white">{{ storageStats.uploads.count }}</div>
                      <div class="text-sm text-gray-500">上傳檔案</div>
                    </div>
                  </div>
                  <div class="text-xs text-gray-400 mt-2">總大小：{{ formatSize(storageStats.uploads.size) }}</div>
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div class="flex items-center gap-3">
                    <i class="fa-solid fa-database text-purple-500 text-2xl"></i>
                    <div>
                      <div class="text-2xl font-bold text-gray-800 dark:text-white">{{ formatSize(storageStats.database.size) }}</div>
                      <div class="text-sm text-gray-500">資料庫大小</div>
                    </div>
                  </div>
                  <div class="text-xs text-gray-400 mt-2">類型：{{ storageStats.database.type.toUpperCase() }}</div>
                </div>
                <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div class="flex items-center gap-3">
                    <i class="fa-solid fa-users text-green-500 text-2xl"></i>
                    <div>
                      <div class="text-2xl font-bold text-gray-800 dark:text-white">{{ storageStats.userUploads.length }}</div>
                      <div class="text-sm text-gray-500">有上傳的使用者</div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- User Uploads Table -->
              <div v-if="storageStats.userUploads.length > 0">
                <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">各使用者上傳統計</h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm">
                        <th class="px-4 py-2 font-semibold">使用者</th>
                        <th class="px-4 py-2 font-semibold text-right">檔案數</th>
                        <th class="px-4 py-2 font-semibold text-right">佔用空間</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr v-for="upload in storageStats.userUploads" :key="upload.userId" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2">
                          <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs">
                              {{ upload.username.charAt(0).toUpperCase() }}
                            </div>
                            <span class="text-gray-800 dark:text-gray-200">{{ upload.name }}</span>
                            <span class="text-xs text-gray-400">@{{ upload.username }}</span>
                          </div>
                        </td>
                        <td class="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{{ upload.count }}</td>
                        <td class="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{{ formatSize(upload.size) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div v-else class="text-center text-gray-400 py-4">
                目前沒有使用者上傳資料
              </div>
            </div>
            <div v-else class="px-6 py-8 text-center text-gray-400">
              <i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
              <p>載入中...</p>
            </div>
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

