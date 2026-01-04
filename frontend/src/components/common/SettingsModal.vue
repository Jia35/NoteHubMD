<script setup>
/**
 * SettingsModal - 設定 Modal
 */
import { ref } from 'vue'

const props = defineProps({
  show: Boolean,
  user: { type: Object, default: null },
  theme: { type: String, default: 'dark' },
  appVersion: { type: String, default: '' }
})

const emit = defineEmits(['close', 'set-theme', 'logout', 'open-about', 'export-notes', 'import-file', 'import-folder'])

const showImportMenu = ref(false)
const importFileInput = ref(null)
const importFolderInput = ref(null)

const handleImportFile = (event) => {
  emit('import-file', event)
  showImportMenu.value = false
}

const handleImportFolder = (event) => {
  emit('import-folder', event)
  showImportMenu.value = false
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center">
            <i class="fa-solid fa-gear mr-2 text-gray-400"></i> 設定
          </h2>
          <button @click="emit('close')" class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        
        <!-- Body -->
        <div class="p-6 space-y-6">
          <!-- Appearance -->
          <div>
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">外觀</h3>
            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                <i class="fa-solid fa-palette mr-2 text-gray-800 dark:text-white"></i>主題模式
              </span>
              <div class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                <button
                  @click="emit('set-theme', 'light')"
                  class="px-3 py-1.5 rounded-md text-sm transition flex items-center cursor-pointer"
                  :class="theme === 'light' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                >
                  <i class="fa-solid fa-sun mr-1.5"></i> Light
                </button>
                <button
                  @click="emit('set-theme', 'dark')"
                  class="px-3 py-1.5 rounded-md text-sm transition flex items-center cursor-pointer"
                  :class="theme === 'dark' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                >
                  <i class="fa-solid fa-moon mr-1.5"></i> Dark
                </button>
              </div>
            </div>
          </div>

          <!-- Data Management (only for logged in users) -->
          <div v-if="user">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">資料管理</h3>
            <!-- Export Notes -->
            <button @click="emit('export-notes')"
                    class="flex items-center w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm cursor-pointer">
              <div class="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mr-3 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform shrink-0">
                <i class="fa-solid fa-file-export"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-800 dark:text-white">匯出我的筆記</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">下載所有筆記為 .zip 檔案</div>
              </div>
            </button>
            <!-- Import Notes -->
            <input type="file" ref="importFileInput" @change="handleImportFile" accept=".md,.zip" class="hidden">
            <input type="file" ref="importFolderInput" @change="handleImportFolder" webkitdirectory class="hidden">
            <div class="relative mt-2">
              <button @click="showImportMenu = !showImportMenu"
                      class="flex items-center w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm cursor-pointer">
                <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0">
                  <i class="fa-solid fa-file-import"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-gray-800 dark:text-white">匯入筆記</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">上傳 .md、.zip 或資料夾</div>
                </div>
                <i class="fa-solid fa-chevron-down text-gray-400 ml-2 text-sm"></i>
              </button>
              <!-- Dropdown Menu -->
              <div v-show="showImportMenu"
                   class="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                <button @click="importFileInput?.click(); showImportMenu = false"
                        class="flex items-center w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left cursor-pointer">
                  <i class="fa-solid fa-file text-blue-500 mr-3"></i>
                  <span class="text-sm text-gray-700 dark:text-gray-200">上傳檔案 (.md 或 .zip)</span>
                </button>
                <button @click="importFolderInput?.click(); showImportMenu = false"
                        class="flex items-center w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-t border-gray-100 dark:border-gray-700 cursor-pointer">
                  <i class="fa-solid fa-folder text-yellow-500 mr-3"></i>
                  <span class="text-sm text-gray-700 dark:text-gray-200">上傳資料夾</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Admin (Conditional) -->
          <div v-if="user && (user.role === 'super-admin' || user.role === 'admin')">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">管理者</h3>
            <router-link to="/admin" @click="emit('close')"
                         class="flex items-center w-full p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition border border-purple-100 dark:border-purple-800/30 group">
              <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center mr-3 text-purple-600 dark:text-purple-300 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-user-shield text-lg"></i>
              </div>
              <div class="text-left flex-1">
                <div class="font-bold text-sm">管理後台</div>
                <div class="text-xs opacity-70">進入系統管理介面</div>
              </div>
              <i class="fa-solid fa-chevron-right ml-2 text-sm opacity-30"></i>
            </router-link>
          </div>

          <!-- Help & Guide -->
          <div>
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 ml-1">使用說明</h3>
            <a href="/s/sys-intro" target="_blank" @click="emit('close')"
               class="flex items-center w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition group text-left shadow-sm">
              <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shrink-0">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-800 dark:text-white">NoteHubMD 使用手冊</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">瞭解平台功能與 Markdown 語法</div>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square text-gray-400 ml-2 text-sm"></i>
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-300 dark:border-gray-700 flex justify-between items-center">
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
  </Teleport>
</template>
