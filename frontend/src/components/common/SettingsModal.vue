<script setup>
/**
 * SettingsModal - 設定 Modal (分頁式 UI)
 */
import { ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import api from '@/composables/useApi'

const props = defineProps({
  show: Boolean,
  user: { type: Object, default: null },
  theme: { type: String, default: 'dark' },
  appVersion: { type: String, default: '' },
  initialTab: { type: String, default: '' },
  aiEnabled: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'set-theme', 'logout', 'open-about', 'export-notes', 'import-file', 'import-folder', 'user-updated', 'update:hideAiFloatingButton'])

// AI Assistant button visibility preference
const hideAiFloatingButton = ref(localStorage.getItem('NoteHubMD-hideAiFloatingButton') === 'true')

const toggleHideAiFloatingButton = () => {
  hideAiFloatingButton.value = !hideAiFloatingButton.value
  localStorage.setItem('NoteHubMD-hideAiFloatingButton', hideAiFloatingButton.value.toString())
  emit('update:hideAiFloatingButton', hideAiFloatingButton.value)
  // Trigger storage event for cross-tab sync
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'NoteHubMD-hideAiFloatingButton',
    newValue: hideAiFloatingButton.value.toString()
  }))
}

// Diagram theme preferences (auto = follow system theme, light, dark)
const whiteboardTheme = ref(localStorage.getItem('NoteHubMD-whiteboardTheme') || 'auto')
const flowchartTheme = ref(localStorage.getItem('NoteHubMD-flowchartTheme') || 'auto')

const setWhiteboardTheme = (value) => {
  whiteboardTheme.value = value
  localStorage.setItem('NoteHubMD-whiteboardTheme', value)
  // Trigger storage event for cross-tab sync
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'NoteHubMD-whiteboardTheme',
    newValue: value
  }))
}

const setFlowchartTheme = (value) => {
  flowchartTheme.value = value
  localStorage.setItem('NoteHubMD-flowchartTheme', value)
  // Trigger storage event for cross-tab sync
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'NoteHubMD-flowchartTheme',
    newValue: value
  }))
}

// Active tab state
const activeTab = ref('profile')

// Import menu state
const showImportMenu = ref(false)
const importFileInput = ref(null)
const importFolderInput = ref(null)

// API Key state
const apiKeyVisible = ref(false)
const apiKeyGenerating = ref(false)
const apiKeyDeleting = ref(false)
const apiKeyCopied = ref(false)

// Profile editing state
const editableName = ref('')
const avatarPreview = ref('')
const savingProfile = ref(false)
const avatarFile = ref(null)
const avatarRemoved = ref(false)

// Cropper state
const showCropperModal = ref(false)
const cropperImageSrc = ref('')
const cropperImageRef = ref(null)
let cropperInstance = null
let pendingAvatarFile = null

// Watch for show changes - reset state
watch(() => props.show, (newVal) => {
  if (newVal) {
    // Set initial tab based on prop or default to appropriate tab
    if (props.initialTab) {
      activeTab.value = props.initialTab
    } else {
      activeTab.value = props.user ? 'profile' : 'appearance'
    }
    showImportMenu.value = false
    
    // Initialize profile data
    if (props.user) {
      editableName.value = props.user.name || ''
      avatarPreview.value = props.user.avatar || ''
      avatarFile.value = null
      avatarRemoved.value = false
    }
  }
})

// Debug: watch avatarPreview changes
watch(avatarPreview, (newVal, oldVal) => {
  console.log('[Watch avatarPreview] Changed from', oldVal, 'to', newVal)
})

// Import handlers
const handleImportFile = (event) => {
  emit('import-file', event)
  showImportMenu.value = false
}

const handleImportFolder = (event) => {
  emit('import-folder', event)
  showImportMenu.value = false
}

// Profile handlers
const handleAvatarChange = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  pendingAvatarFile = file
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    showCropperModal.value = true
    
    setTimeout(() => {
      if (cropperImageRef.value) {
        cropperInstance = new Cropper(cropperImageRef.value, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.9,
          cropBoxMovable: true,
          cropBoxResizable: true,
          background: false
        })
      }
    }, 100)
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

const closeCropperModal = () => {
  showCropperModal.value = false
  if (cropperInstance) {
    cropperInstance.destroy()
    cropperInstance = null
  }
  cropperImageSrc.value = ''
  pendingAvatarFile = null
}

const rotateCropper = (degree) => {
  if (cropperInstance) {
    cropperInstance.rotate(degree)
  }
}

const applyCrop = async () => {
  if (!cropperInstance) return
  
  try {
    const cropData = cropperInstance.getData()
    const canvas = cropperInstance.getCroppedCanvas({
      width: 256,
      height: 256,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    })
    
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    
    avatarFile.value = {
      cropped: croppedFile,
      original: pendingAvatarFile,
      cropData: cropData
    }
    avatarRemoved.value = false
    avatarPreview.value = canvas.toDataURL('image/jpeg', 0.9)
    
    closeCropperModal()
  } catch (e) {
    console.error('Crop failed:', e)
  }
}

const openReCropModal = () => {
  let imageSrc = null
  if (avatarFile.value?.original) {
    const reader = new FileReader()
    reader.onload = (e) => {
      cropperImageSrc.value = e.target.result
      showCropperModal.value = true
      initCropperWithDelay()
    }
    reader.readAsDataURL(avatarFile.value.original)
    return
  } else if (props.user?.avatarOriginal) {
    imageSrc = props.user.avatarOriginal
  } else if (avatarPreview.value) {
    imageSrc = avatarPreview.value
  }
  
  if (!imageSrc) return
  
  cropperImageSrc.value = imageSrc
  showCropperModal.value = true
  initCropperWithDelay()
}

const initCropperWithDelay = () => {
  setTimeout(() => {
    if (cropperImageRef.value) {
      cropperInstance = new Cropper(cropperImageRef.value, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        cropBoxMovable: true,
        cropBoxResizable: true,
        background: false
      })
    }
  }, 100)
}

const removeAvatar = () => {
  avatarPreview.value = ''
  avatarFile.value = null
  avatarRemoved.value = true
}

const saveProfile = async () => {
  savingProfile.value = true
  try {
    let avatarUrl = props.user?.avatar
    let avatarOriginalUrl = props.user?.avatarOriginal
    
    if (avatarRemoved.value) {
      avatarUrl = null
      avatarOriginalUrl = null
    } else if (avatarFile.value) {
      if (avatarFile.value.cropped) {
        const croppedResult = await api.uploadAvatar(avatarFile.value.cropped)
        avatarUrl = croppedResult.url
        
        if (avatarFile.value.original) {
          const originalResult = await api.uploadAvatar(avatarFile.value.original)
          avatarOriginalUrl = originalResult.url
        }
      }
    }
    
    await api.updateProfile({
      name: editableName.value,
      avatar: avatarUrl,
      avatarOriginal: avatarOriginalUrl
    })
    
    emit('user-updated', {
      name: editableName.value,
      avatar: avatarUrl,
      avatarOriginal: avatarOriginalUrl
    })
    
    // Reset state
    avatarFile.value = null
    avatarRemoved.value = false
    pendingAvatarFile = null
    
    // Always sync preview with the final avatar URL after successful save
    // Add timestamp to bust cache
    const finalUrl = avatarUrl ? `${avatarUrl}?t=${Date.now()}` : ''
    console.log('[SaveProfile] Setting avatarPreview to:', finalUrl)
    avatarPreview.value = finalUrl
    console.log('[SaveProfile] avatarPreview is now:', avatarPreview.value)
  } catch (e) {
    console.error('Save profile failed:', e)
  } finally {
    savingProfile.value = false
  }
}

// Tab definitions
const tabs = [
  { id: 'profile', label: '個人資料', icon: 'fa-solid fa-user', requireLogin: true },
  { id: 'appearance', label: '外觀', icon: 'fa-solid fa-palette', requireLogin: false },
  { id: 'data', label: '資料管理', icon: 'fa-solid fa-folder-open', requireLogin: true },
  { id: 'advanced', label: '進階功能', icon: 'fa-solid fa-key', requireApiKey: true },
  { id: 'admin', label: '管理者', icon: 'fa-solid fa-user-shield', requireAdmin: true },
  { id: 'help', label: '使用說明', icon: 'fa-solid fa-book-open', requireLogin: false }
]

const visibleTabs = () => {
  return tabs.filter(tab => {
    if (tab.requireAdmin) {
      return props.user && (props.user.role === 'super-admin' || props.user.role === 'admin')
    }
    if (tab.requireApiKey) {
      return props.user && props.user.isApiKeyEnabled
    }
    if (tab.requireLogin) {
      return !!props.user
    }
    return true
  })
}

// API Key functions
const generateApiKey = async (isRegenerate = false) => {
  if (isRegenerate) {
    if (!confirm('確定要重新產生 API Key 嗎？現有的 Key 將立即失效。')) return
  }
  apiKeyGenerating.value = true
  try {
    const result = await api.generateApiKey()
    // Update user object with new key (emit event to parent)
    emit('user-updated', { apiKey: result.apiKey })
  } catch (e) {
    console.error('Failed to generate API key:', e)
  } finally {
    apiKeyGenerating.value = false
  }
}

const deleteApiKey = async () => {
  if (!confirm('確定要刪除 API Key 嗎？刪除後將無法使用現有的 Key 存取 API。')) return
  apiKeyDeleting.value = true
  try {
    await api.deleteApiKey()
    emit('user-updated', { apiKey: null })
  } catch (e) {
    console.error('Failed to delete API key:', e)
  } finally {
    apiKeyDeleting.value = false
  }
}

const copyApiKey = async () => {
  if (!props.user?.apiKey) return
  try {
    await navigator.clipboard.writeText(props.user.apiKey)
    apiKeyCopied.value = true
    setTimeout(() => { apiKeyCopied.value = false }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col" style="height: 70vh;">
        <!-- Header -->
        <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
          <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center">
            <i class="fa-solid fa-gear mr-2 text-gray-400"></i> 設定
          </h2>
          <button @click="emit('close')" class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        
        <!-- Body with Tabs -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Left Sidebar Tabs -->
          <div class="w-40 border-r border-gray-300 dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-800/30">
            <button
              v-for="tab in visibleTabs()"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="activeTab === tab.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-r-2 border-blue-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'"
              class="w-full px-4 py-3 text-left text-sm font-medium transition flex items-center cursor-pointer"
            >
              <i :class="tab.icon" class="mr-2 w-4 text-center"></i>{{ tab.label }}
            </button>
          </div>

          <!-- Right Content Area -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Profile Tab -->
            <div v-show="activeTab === 'profile' && user" class="space-y-6">
              <!-- Avatar Section -->
              <div class="flex flex-col items-center">
                <label class="cursor-pointer group">
                  <div class="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-3 relative"
                       :class="user ? 'bg-blue-600' : 'bg-gray-500'">
                    <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover" alt="Avatar">
                    <span v-else class="text-3xl text-white">{{ user?.username?.charAt(0).toUpperCase() || '?' }}</span>
                    <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                      <i class="fa-solid fa-camera text-white text-xl"></i>
                    </div>
                  </div>
                  <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange">
                </label>
                <div class="flex gap-3">
                  <label class="cursor-pointer text-blue-600 hover:text-blue-700 text-sm">
                    <i class="fa-solid fa-camera mr-1"></i>變更頭像
                    <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange">
                  </label>
                  <button v-if="avatarPreview && !avatarRemoved" @click="openReCropModal"
                          class="text-purple-500 hover:text-purple-600 text-sm cursor-pointer">
                    <i class="fa-solid fa-crop mr-1"></i>重新裁切
                  </button>
                  <button v-if="avatarPreview" @click="removeAvatar"
                          class="text-red-500 hover:text-red-600 text-sm cursor-pointer">
                    <i class="fa-solid fa-trash mr-1"></i>移除頭像
                  </button>
                </div>
              </div>

              <!-- Username -->
              <div>
                <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">帳號 (Username)</label>
                <div class="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 text-sm">
                  {{ user?.username }}
                </div>
              </div>

              <!-- Name -->
              <div>
                <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">顯示名稱 (Name)</label>
                <input v-model="editableName" type="text" placeholder="輸入顯示名稱..."
                       class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>

              <!-- Save Button -->
              <div class="flex justify-end">
                <button @click="saveProfile" :disabled="savingProfile"
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer">
                  <i v-if="savingProfile" class="fa-solid fa-spinner fa-spin mr-1"></i>
                  <i v-else class="fa-solid fa-save mr-1"></i>
                  儲存個人資料
                </button>
              </div>
            </div>

            <!-- Appearance Tab -->
            <div v-show="activeTab === 'appearance'" class="space-y-4">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">主題模式</h3>
              <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <i class="fa-solid fa-palette mr-2 text-gray-500"></i>網站主題
                  </span>
                  <div class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      @click="emit('set-theme', 'light')"
                      class="px-4 py-2 rounded-md text-sm transition flex items-center cursor-pointer"
                      :class="theme === 'light' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-sun mr-1.5"></i> Light
                    </button>
                    <button
                      @click="emit('set-theme', 'dark')"
                      class="px-4 py-2 rounded-md text-sm transition flex items-center cursor-pointer"
                      :class="theme === 'dark' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-moon mr-1.5"></i> Dark
                    </button>
                  </div>
                </div>
                
                <!-- Whiteboard Theme -->
                <div class="mt-6 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <i class="fa-solid fa-chalkboard mr-2 text-purple-500"></i>白板主題
                  </span>
                  <div class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      @click="setWhiteboardTheme('auto')"
                      class="px-3 py-1.5 rounded-md text-xs transition flex items-center cursor-pointer"
                      :class="whiteboardTheme === 'auto' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-circle-half-stroke mr-1"></i>跟隨網站
                    </button>
                    <button
                      @click="setWhiteboardTheme('light')"
                      class="px-3 py-1.5 rounded-md text-xs transition flex items-center cursor-pointer"
                      :class="whiteboardTheme === 'light' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-sun mr-1"></i>Light
                    </button>
                    <button
                      @click="setWhiteboardTheme('dark')"
                      class="px-3 py-1.5 rounded-md text-xs transition flex items-center cursor-pointer"
                      :class="whiteboardTheme === 'dark' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-moon mr-1"></i>Dark
                    </button>
                  </div>
                </div>
                
                <!-- Flowchart Theme -->
                <div class="mt-6 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                    <i class="fa-solid fa-project-diagram mr-2 text-teal-500"></i>流程圖主題
                  </span>
                  <div class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      @click="setFlowchartTheme('auto')"
                      class="px-3 py-1.5 rounded-md text-xs transition flex items-center cursor-pointer"
                      :class="flowchartTheme === 'auto' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-circle-half-stroke mr-1"></i>跟隨網站
                    </button>
                    <button
                      @click="setFlowchartTheme('light')"
                      class="px-3 py-1.5 rounded-md text-xs transition flex items-center cursor-pointer"
                      :class="flowchartTheme === 'light' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-sun mr-1"></i>Light
                    </button>
                    <button
                      @click="setFlowchartTheme('dark')"
                      class="px-3 py-1.5 rounded-md text-xs transition flex items-center cursor-pointer"
                      :class="flowchartTheme === 'dark' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                    >
                      <i class="fa-solid fa-moon mr-1"></i>Dark
                    </button>
                  </div>
                </div>
              </div>

              <!-- AI Assistant Button Visibility (only show if AI is enabled) -->
              <template v-if="aiEnabled">
                <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mt-6">AI 助理</h3>
                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div class="flex-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                      <i class="fa-solid fa-robot mr-2 text-gray-500"></i>隱藏懸浮按鈕
                    </span>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      開啟後，AI 助理入口將移至狀態列「更多」選單內
                    </p>
                  </div>
                  <button 
                    @click="toggleHideAiFloatingButton"
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    :class="hideAiFloatingButton ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'"
                    role="switch"
                    :aria-checked="hideAiFloatingButton"
                  >
                    <span 
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      :class="hideAiFloatingButton ? 'translate-x-5' : 'translate-x-0'"
                    ></span>
                  </button>
                </div>
              </template>
            </div>

            <!-- Data Management Tab -->
            <div v-show="activeTab === 'data' && user" class="space-y-4">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">資料管理</h3>
              
              <!-- Export Notes -->
              <button @click="emit('export-notes')"
                      class="flex items-center w-full p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm cursor-pointer">
                <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-4 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform shrink-0">
                  <i class="fa-solid fa-file-export text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 dark:text-white">匯出我的筆記</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">下載所有筆記為 .zip 檔案</div>
                </div>
              </button>
              
              <!-- Import Notes -->
              <input type="file" ref="importFileInput" @change="handleImportFile" accept=".md,.zip,.excalidraw,.drawio" class="hidden">
              <input type="file" ref="importFolderInput" @change="handleImportFolder" webkitdirectory class="hidden">
              <div class="relative">
                <button @click="showImportMenu = !showImportMenu"
                        class="flex items-center w-full p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm cursor-pointer">
                  <div class="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0">
                    <i class="fa-solid fa-file-import text-lg"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-800 dark:text-white">匯入筆記</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate">上傳 檔案 或 資料夾</div>
                  </div>
                  <i class="fa-solid fa-chevron-down text-gray-400 ml-2 text-sm"></i>
                </button>
                <!-- Dropdown Menu -->
                <div v-show="showImportMenu"
                     class="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                  <button @click="importFileInput?.click(); showImportMenu = false"
                          class="flex items-center w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left cursor-pointer">
                    <i class="fa-solid fa-file text-blue-500 mr-3"></i>
                    <span class="text-sm text-gray-700 dark:text-gray-200">上傳檔案 (.md, .excalidraw, .drawio, .zip)</span>
                  </button>
                  <button @click="importFolderInput?.click(); showImportMenu = false"
                          class="flex items-center w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-t border-gray-100 dark:border-gray-700 cursor-pointer">
                    <i class="fa-solid fa-folder text-yellow-500 mr-3"></i>
                    <span class="text-sm text-gray-700 dark:text-gray-200">上傳資料夾</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Advanced Features Tab -->
            <div v-show="activeTab === 'advanced' && user && user.isApiKeyEnabled" class="space-y-4">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">API Key</h3>
              
              <!-- Info Box -->
              <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div class="flex items-start">
                  <i class="fa-solid fa-circle-info text-blue-500 mt-0.5 mr-3"></i>
                  <div class="text-sm text-blue-700 dark:text-blue-300">
                    <p class="font-medium mb-1">使用方式</p>
                    <p class="text-xs opacity-80 mb-1">在 HTTP 請求中加入以下任一 Header：</p>
                    <ul class="text-xs opacity-80 list-disc list-inside space-y-0.5">
                      <li><code class="bg-blue-100 dark:bg-blue-800 px-1 rounded">X-API-Key: sk-nh-xxx</code></li>
                      <li><code class="bg-blue-100 dark:bg-blue-800 px-1 rounded">Authorization: Bearer sk-nh-xxx</code></li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- API Key Display/Generate -->
              <div class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <template v-if="user.apiKey">
                  <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">您的 API Key</label>
                  <div class="flex items-center gap-2 mb-3">
                    <div class="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                      {{ apiKeyVisible ? user.apiKey : '•'.repeat(36) }}
                    </div>
                    <button @click="apiKeyVisible = !apiKeyVisible" 
                            class="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                            :title="apiKeyVisible ? '隱藏' : '顯示'">
                      <i :class="apiKeyVisible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
                    </button>
                    <button @click="copyApiKey" 
                            class="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                            :title="apiKeyCopied ? '已複製!' : '複製'">
                      <i :class="apiKeyCopied ? 'fa-solid fa-check text-green-500' : 'fa-solid fa-copy'"></i>
                    </button>
                  </div>
                  <div class="flex gap-2">
                    <button @click="generateApiKey(true)" :disabled="apiKeyGenerating"
                            class="px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400 hover:text-white border border-yellow-500 rounded hover:bg-yellow-500 transition disabled:opacity-50 cursor-pointer">
                      <i v-if="apiKeyGenerating" class="fa-solid fa-spinner fa-spin mr-1"></i>
                      <i v-else class="fa-solid fa-rotate mr-1"></i>
                      重新產生
                    </button>
                    <button @click="deleteApiKey" :disabled="apiKeyDeleting"
                            class="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:text-white border border-red-700 rounded hover:bg-red-700 transition disabled:opacity-50 cursor-pointer">
                      <i v-if="apiKeyDeleting" class="fa-solid fa-spinner fa-spin mr-1"></i>
                      <i v-else class="fa-solid fa-trash mr-1"></i>
                      刪除 Key
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="text-center py-4">
                    <i class="fa-solid fa-key text-4xl text-gray-300 dark:text-gray-600 mb-3"></i>
                    <p class="text-gray-500 dark:text-gray-400 mb-4">您尚未產生 API Key</p>
                    <button @click="generateApiKey" :disabled="apiKeyGenerating"
                            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer">
                      <i v-if="apiKeyGenerating" class="fa-solid fa-spinner fa-spin mr-1"></i>
                      <i v-else class="fa-solid fa-plus mr-1"></i>
                      產生 API Key
                    </button>
                  </div>
                </template>
              </div>

              <!-- Warning -->
              <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div class="flex items-start">
                  <i class="fa-solid fa-triangle-exclamation text-yellow-500 mt-0.5 mr-3"></i>
                  <p class="text-xs text-yellow-700 dark:text-yellow-300">
                    API Key 等同於您的帳號密碼，請妥善保管並勿分享給他人。
                  </p>
                </div>
              </div>

              <!-- API Documentation Link -->
              <a href="/api-docs" target="_blank"
                 class="flex items-center w-full p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm">
                <div class="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-3 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform shrink-0">
                  <i class="fa-solid fa-book text-base"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 dark:text-white">API 文件</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">查看與測試 API 端點</div>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square text-gray-400 ml-2 text-sm"></i>
              </a>
            </div>

            <!-- Admin Tab -->
            <div v-show="activeTab === 'admin' && user && (user.role === 'super-admin' || user.role === 'admin')" class="space-y-4">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">管理者</h3>
              <router-link to="/admin" @click="emit('close')"
                           class="flex items-center w-full p-4 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition border border-purple-100 dark:border-purple-800/30 group">
                <div class="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center mr-4 text-purple-600 dark:text-purple-300 group-hover:scale-110 transition-transform">
                  <i class="fa-solid fa-user-shield text-lg"></i>
                </div>
                <div class="text-left flex-1">
                  <div class="font-bold text-sm">管理後台</div>
                  <div class="text-xs opacity-70">進入系統管理介面</div>
                </div>
                <i class="fa-solid fa-chevron-right ml-2 text-sm opacity-30"></i>
              </router-link>
            </div>

            <!-- Help Tab -->
            <div v-show="activeTab === 'help'" class="space-y-4">
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">使用說明</h3>
              <a href="/s/sys-intro" target="_blank" @click="emit('close')"
                 class="flex items-center w-full p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm">
                <div class="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0">
                  <i class="fa-solid fa-book-open text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-800 dark:text-white">NoteHubMD 使用手冊</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">瞭解平台功能與 Markdown 語法</div>
                </div>
                <i class="fa-solid fa-arrow-up-right-from-square text-gray-400 ml-2 text-sm"></i>
              </a>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-300 dark:border-gray-700 flex justify-between items-center shrink-0">
          <button @click="emit('close'); emit('open-about')" title="關於 NoteHubMD"
                  class="text-xs text-gray-400 hover:text-blue-500 transition flex items-center cursor-pointer">
            v{{ appVersion }} <i class="fa-solid fa-circle-info ml-1 text-[10px]"></i>
          </button>
          <button v-if="user" @click="emit('logout')" class="flex items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition cursor-pointer">
            <i class="fa-solid fa-right-from-bracket mr-2"></i>登出
          </button>
          <router-link v-else to="/login" @click="emit('close')" class="flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition">
            <i class="fa-solid fa-right-to-bracket mr-2"></i>登入
          </router-link>
        </div>
      </div>
    </div>

    <!-- Avatar Cropper Modal -->
    <div v-if="showCropperModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
      <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-full max-w-lg mx-4 text-gray-900 dark:text-gray-100">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold"><i class="fa-solid fa-crop mr-2"></i>裁切頭像</h2>
          <button @click="closeCropperModal"
                  class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div class="relative w-full h-80 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-4">
          <img ref="cropperImageRef" :src="cropperImageSrc" class="max-w-full" style="display: block; max-width: 100%;">
        </div>

        <div class="flex justify-between items-center">
          <div class="flex gap-2">
            <button @click="rotateCropper(-90)"
                    class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                    title="向左旋轉">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button @click="rotateCropper(90)"
                    class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                    title="向右旋轉">
              <i class="fa-solid fa-rotate-right"></i>
            </button>
          </div>
          <div class="flex gap-2">
            <button @click="closeCropperModal"
                    class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
              取消
            </button>
            <button @click="applyCrop"
                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition cursor-pointer">
              <i class="fa-solid fa-check mr-1"></i>確定裁切
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
