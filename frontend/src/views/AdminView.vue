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

// AI Assistant settings state
const aiSettings = ref({
  enabled: false,
  provider: 'openai',
  apiUrl: '',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 2000,
  welcomeMessage: '',
  suggestedQuestions: []
})
const aiSettingsLoading = ref(false)
const aiTestResult = ref(null)
const aiTestLoading = ref(false)
const aiSaving = ref(false)

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

// Toggle user API key feature
const toggleUserApiKey = async (targetUser, enabled) => {
  try {
    await api.toggleUserApiKey(targetUser.id, enabled)
    targetUser.isApiKeyEnabled = enabled
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

// Load AI settings
const loadAiSettings = async () => {
  aiSettingsLoading.value = true
  try {
    const settings = await api.getAiSettings()
    aiSettings.value = { ...aiSettings.value, ...settings }
  } catch (e) {
    console.error('Failed to load AI settings', e)
  } finally {
    aiSettingsLoading.value = false
  }
}

// Save AI settings
const saveAiSettings = async () => {
  aiSaving.value = true
  aiTestResult.value = null
  try {
    const settings = await api.updateAiSettings(aiSettings.value)
    aiSettings.value = { ...aiSettings.value, ...settings }
    showAlert?.('AI 設定已儲存', 'success')
  } catch (e) {
    showAlert?.('儲存失敗：' + e.message, 'error')
  } finally {
    aiSaving.value = false
  }
}

// Add suggested question
const addSuggestedQuestion = () => {
  if (!aiSettings.value.suggestedQuestions) {
    aiSettings.value.suggestedQuestions = []
  }
  if (aiSettings.value.suggestedQuestions.length >= 5) return
  aiSettings.value.suggestedQuestions.push({
    displayText: '',
    promptText: '',
    autoGenerate: false
  })
}

// Remove suggested question
const removeSuggestedQuestion = (index) => {
  aiSettings.value.suggestedQuestions.splice(index, 1)
}

// Test AI connection
const testAiConnection = async () => {
  aiTestLoading.value = true
  aiTestResult.value = null
  try {
    // Build test config: only send new apiKey if user entered one, otherwise use hasApiKey flag
    const testConfig = {
      provider: aiSettings.value.provider,
      apiUrl: aiSettings.value.apiUrl,
      model: aiSettings.value.model
    }
    
    // Check if user entered a new API key (not masked)
    if (aiSettings.value.apiKey && !aiSettings.value.apiKey.includes('*')) {
      testConfig.apiKey = aiSettings.value.apiKey
    } else {
      // Use existing key from server
      testConfig.hasApiKey = aiSettings.value.hasApiKey
    }
    
    const result = await api.testAiConnection(testConfig)
    aiTestResult.value = { success: true, message: result.message }
  } catch (e) {
    aiTestResult.value = { success: false, message: e.message }
  } finally {
    aiTestLoading.value = false
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
            <button 
              @click="activeTab = 'ai'; loadAiSettings()"
              class="px-4 py-2 font-medium text-sm transition-colors"
              :class="activeTab === 'ai' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            >
              <i class="fa-solid fa-robot mr-2"></i>AI 助理
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
                    <th class="px-6 py-3 font-semibold">API Key</th>
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
                    <td class="px-6 py-4">
                      <button 
                        @click="toggleUserApiKey(u, !u.isApiKeyEnabled)"
                        class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer"
                        :class="u.isApiKeyEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'"
                        :title="u.isApiKeyEnabled ? '點擊停用' : '點擊啟用'"
                      >
                        <span 
                          class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                          :class="u.isApiKeyEnabled ? 'translate-x-5' : 'translate-x-1'"
                        ></span>
                      </button>
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

        <!-- AI Assistant Settings Tab -->
        <div v-if="activeTab === 'ai'">
          <div class="bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 class="text-xl font-bold text-gray-800 dark:text-white">
                <i class="fa-solid fa-robot mr-2"></i>AI 助理設定
              </h2>
              <div class="flex items-center gap-2">
                <span class="text-sm text-gray-500">啟用狀態</span>
                <button 
                  @click="aiSettings.enabled = !aiSettings.enabled"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
                  :class="aiSettings.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'"
                >
                  <span 
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="aiSettings.enabled ? 'translate-x-6' : 'translate-x-1'"
                  ></span>
                </button>
              </div>
            </div>
            
            <div class="px-6 py-4" v-if="!aiSettingsLoading">
              <!-- LLM Configuration Section -->
              <div class="mb-8">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
                  <i class="fa-solid fa-server mr-2 text-blue-500"></i>
                  模型設定
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <!-- Provider -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Provider</label>
                    <select 
                      v-model="aiSettings.provider"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="openai">OpenAI (相容 API)</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </div>
                  
                  <!-- Model -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">模型名稱</label>
                    <input 
                      v-model="aiSettings.model"
                      type="text"
                      placeholder="e.g., gpt-4, llama3"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                  </div>
                  
                  <!-- API URL -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      API URL
                      <span class="text-gray-400 font-normal">(選填)</span>
                    </label>
                    <input 
                      v-model="aiSettings.apiUrl"
                      type="text"
                      :placeholder="aiSettings.provider === 'ollama' ? 'http://localhost:11434/api' : 'https://api.openai.com/v1'"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                  </div>
                  
                  <!-- API Key -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      API Key
                      <span v-if="aiSettings.hasApiKey" class="text-green-500 text-xs ml-2"><i class="fa-solid fa-check-circle"></i> 已設定</span>
                    </label>
                    <input 
                      v-model="aiSettings.apiKey"
                      placeholder="sk-..."
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                  </div>
                  
                  <!-- Temperature & Max Tokens -->
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Temperature ({{ aiSettings.temperature }})
                    </label>
                    <input 
                      v-model.number="aiSettings.temperature"
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      class="w-full"
                    >
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Max Tokens</label>
                    <input 
                      v-model.number="aiSettings.maxTokens"
                      type="number"
                      min="100"
                      max="8000"
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                  </div>
                  
                  <!-- System Prompt -->
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">System Prompt</label>
                    <textarea 
                      v-model="aiSettings.systemPrompt"
                      rows="3"
                      placeholder="You are a helpful AI assistant..."
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    ></textarea>
                  </div>
                  
                  <!-- Test Connection -->
                  <div class="md:col-span-2 flex items-center justify-end gap-3">
                    <div v-if="aiTestResult" class="flex-1 p-2 rounded-lg text-sm" :class="aiTestResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'">
                      <i :class="aiTestResult.success ? 'fa-solid fa-check-circle' : 'fa-solid fa-times-circle'" class="mr-1"></i>
                      {{ aiTestResult.message }}
                    </div>
                    <button 
                      @click="testAiConnection"
                      :disabled="aiTestLoading"
                      class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50"
                    >
                      <i v-if="aiTestLoading" class="fa-solid fa-spinner fa-spin mr-1"></i>
                      <i v-else class="fa-solid fa-plug mr-1"></i>
                      測試連線
                    </button>
                  </div>
                
                </div>
              </div>
              
              <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                  <i class="fa-solid fa-lightbulb mr-2 text-yellow-500"></i>建議問題
                </h3>
                                
                <!-- Welcome Message Input -->
                <div class="mb-6">
                  <label class="block text-sm font-medium mb-2">歡迎訊息</label>
                  <input 
                    v-model="aiSettings.welcomeMessage"
                    type="text"
                    placeholder="向 AI 詢問關於此筆記的問題"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                  <p class="text-xs text-gray-500 mt-1">在新對話時顯示的歡迎文字</p>
                </div>


                <div class="flex items-center justify-between mb-4">
                  <p class="text-sm font-medium">
                    建議問題列表（最多 5 組）
                  </p>
                  <button 
                    @click="addSuggestedQuestion"
                    :disabled="(aiSettings.suggestedQuestions?.length || 0) >= 5"
                    class="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <i class="fa-solid fa-plus mr-1"></i>新增問題
                  </button>
                </div>
                
                <div v-if="aiSettings.suggestedQuestions?.length" class="space-y-4">
                  <div 
                    v-for="(q, index) in aiSettings.suggestedQuestions" 
                    :key="index"
                    class="flex items-end gap-2"
                  >
                    <!-- AI 自動建議功能暫時隱藏，未來需要時取消註解即可恢復 -->
                    <div v-if="!q.autoGenerate" class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label class="block text-xs text-gray-500 mb-1">顯示文字</label>
                        <input 
                          v-model="q.displayText"
                          type="text"
                          placeholder="按鈕上顯示的文字"
                          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                      </div>
                      <div class="md:col-span-2">
                        <label class="block text-xs text-gray-500 mb-1">實際送出文字</label>
                        <input 
                          v-model="q.promptText"
                          type="text"
                          placeholder="發送給 AI 的完整提示詞"
                          class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                      </div>
                    </div>
                    <div v-else class="flex-1 text-sm text-gray-500 dark:text-gray-400 italic">
                      <i class="fa-solid fa-magic mr-1"></i>AI 自動生成
                    </div>
                    <button 
                      @click="removeSuggestedQuestion(index)"
                      class="mb-1 text-gray-400 hover:text-red-500 cursor-pointer transition flex-shrink-0"
                      title="刪除"
                    >
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div v-else class="text-center text-gray-400 py-4">
                  尚未設定建議問題，點擊「新增」按鈕開始設定
                </div>
              </div>
              
              <!-- Actions -->
              <div class="mt-6 flex items-center justify-end">
                <button 
                  @click="saveAiSettings"
                  :disabled="aiSaving"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer"
                >
                  <i v-if="aiSaving" class="fa-solid fa-spinner fa-spin mr-2"></i>
                  <i v-else class="fa-solid fa-save mr-2"></i>
                  儲存設定
                </button>
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

