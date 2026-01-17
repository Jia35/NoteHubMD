<script setup>
import { ref, watch, computed } from 'vue'
import api from '@/composables/useApi'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps({
  show: Boolean,
  type: String,
  item: Object,
  tab: { type: String, default: 'info' },
  editableDescription: String,
  editableTags: Array,
  newTagInput: String,
  editablePermission: String,
  commentsEnabled: Boolean,
  userPermissions: Array,
  loadingUserPermissions: Boolean,
  userSearchQuery: String,
  userSearchResults: Array,
  newUserPermission: { type: String, default: 'view' },
  books: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'close', 'save', 'update:tab', 'update:title', 'update:description', 'update:permission',
  'update:commentsEnabled', 'update:newTag', 'update:newUserPermission',
  'update:isPublic', 'update:shareId', 'update:shareAlias', 'add-tag', 'remove-tag', 'search-users', 'add-user-permission',
  'remove-user-permission', 'update-user-permission', 'move-note', 'export-markdown', 'export-pdf',
  'export-whiteboard', 'export-whiteboard-png', 'export-whiteboard-svg',
  'export-flowchart', 'export-flowchart-svg'
])

const selectedMoveBookId = ref('')

watch(() => props.item, (newItem) => {
  if (newItem && props.type === 'note') {
    selectedMoveBookId.value = newItem.bookId || ''
  }
}, { immediate: true })

const formatDate = (dateStr) => {
  if (!dateStr) return '(無)'
  return window.dayjs ? window.dayjs(dateStr).format('YYYY/MM/DD HH:mm') : new Date(dateStr).toLocaleString()
}

const getPermissionLabel = (permission) => {
  const labels = {
    'public-edit': '可編輯',
    'auth-edit': '可編輯 (需登入)',
    'public-view': '唯讀',
    'auth-view': '唯讀 (需登入)',
    'private': '私人',
    'inherit': '繼承書本'
  }
  return labels[permission] || permission
}

const moveNote = () => {
  emit('move-note', selectedMoveBookId.value || null)
}

// Computed: Can edit tags (books, whiteboard and drawio notes, not markdown)
const canEditTags = computed(() => {
  if (props.type === 'book' && props.item?.canEdit) return true
  if (props.type === 'note' && (props.item?.noteType === 'excalidraw' || props.item?.noteType === 'drawio') && props.item?.canEdit) return true
  return false
})

// Share functionality
const copyStatus = ref('')
const resettingShare = ref(false)
const generatingShare = ref(false)
const shareCopied = ref(false)

// Alias functionality
const aliasEnabled = ref(false)
const aliasInput = ref('')
const aliasError = ref('')
const aliasSaving = ref(false)
const currentAlias = ref('')
const aliasCopied = ref(false)

const shareUrl = computed(() => {
  if (!props.item?.shareId) return ''
  const prefix = props.type === 'book' ? '/v/' : '/s/'
  return `${window.location.origin}${prefix}${props.item.shareId}`
})

const aliasUrl = computed(() => {
  if (!currentAlias.value) return ''
  const prefix = props.type === 'book' ? '/v/' : '/s/'
  return `${window.location.origin}${prefix}${currentAlias.value}`
})

// Initialize alias state when item changes
watch(() => props.item, (newItem) => {
  if (newItem) {
    currentAlias.value = newItem.shareAlias || ''
    aliasInput.value = newItem.shareAlias || ''
    aliasEnabled.value = !!newItem.shareAlias
  }
}, { immediate: true })

const copyShareLink = async () => {
  const success = await copyToClipboard(shareUrl.value)
  if (success) {
    shareCopied.value = true
    setTimeout(() => { shareCopied.value = false }, 2000)
  } else {
    console.error('Failed to copy')
  }
}

const resetShareLink = async () => {
  if (!props.item?.id) return
  resettingShare.value = true
  try {
    const result = props.type === 'book' 
      ? await api.resetBookShareId(props.item.id)
      : await api.resetShareId(props.item.id)
    emit('update:shareId', result.shareId)
    // Reset alias when share link is reset
    currentAlias.value = ''
    aliasInput.value = ''
    aliasEnabled.value = false
  } catch (e) {
    console.error('Failed to reset share link:', e)
  } finally {
    resettingShare.value = false
  }
}

const generateShareLink = async () => {
  if (!props.item?.id) return
  generatingShare.value = true
  try {
    const result = props.type === 'book'
      ? await api.generateBookShareId(props.item.id)
      : await api.generateShareId(props.item.id)
    emit('update:shareId', result.shareId)
  } catch (e) {
    console.error('Failed to generate share link:', e)
  } finally {
    generatingShare.value = false
  }
}

const toggleAlias = () => {
  aliasEnabled.value = !aliasEnabled.value
  if (!aliasEnabled.value && currentAlias.value) {
    // Clear alias when disabled
    clearAlias()
  }
}

const saveAlias = async () => {
  if (!props.item?.id) return
  
  const alias = aliasInput.value.trim()
  
  // Validation
  if (!alias) {
    aliasError.value = '請輸入別名'
    return
  }
  
  if (!/^[a-z0-9_-]+$/.test(alias)) {
    aliasError.value = '只能使用小寫英文、數字、連字號(-)和底線(_)'
    return
  }
  
  aliasSaving.value = true
  aliasError.value = ''
  
  try {
    if (props.type === 'book') {
      await api.setBookShareAlias(props.item.id, alias)
    } else {
      await api.setShareAlias(props.item.id, alias)
    }
    currentAlias.value = alias
    emit('update:shareAlias', alias)
  } catch (e) {
    aliasError.value = e.message || '儲存失敗'
  } finally {
    aliasSaving.value = false
  }
}

const clearAlias = async () => {
  if (!props.item?.id) return
  
  try {
    if (props.type === 'book') {
      await api.clearBookShareAlias(props.item.id)
    } else {
      await api.clearShareAlias(props.item.id)
    }
    currentAlias.value = ''
    aliasInput.value = ''
    emit('update:shareAlias', '')
  } catch (e) {
    console.error('Failed to clear alias:', e)
  }
}

const copyAliasUrl = async () => {
  const success = await copyToClipboard(aliasUrl.value)
  if (success) {
    aliasCopied.value = true
    setTimeout(() => { aliasCopied.value = false }, 2000)
  } else {
    console.error('Failed to copy alias URL')
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
    <div class="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col" style="height: 70vh;">
      <!-- Modal Header -->
      <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 shrink-0">
        <h2 class="text-xl font-bold text-gray-800 dark:text-white">
          <i :class="type === 'book' ? 'fa-solid fa-book' : 'fa-solid fa-note-sticky'" class="mr-2"></i>
          {{ type === 'book' ? '書本設定' : '筆記設定' }}
        </h2>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <!-- Modal Body with Tabs -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left Sidebar Tabs -->
        <div class="w-40 border-r border-gray-300 dark:border-gray-700 shrink-0">
          <button
            @click="emit('update:tab', 'info')"
            :class="tab === 'info' ? 'text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            class="w-full px-4 py-3 text-left text-sm font-medium transition flex items-center cursor-pointer"
          >
            <i class="fa-solid fa-info-circle mr-2"></i>{{ type === 'book' ? '書本資訊' : '筆記資訊' }}
          </button>
          <button
            @click="emit('update:tab', 'permission')"
            :class="tab === 'permission' ? 'text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            class="w-full px-4 py-3 text-left text-sm font-medium transition flex items-center cursor-pointer"
          >
            <i class="fa-solid fa-lock mr-2"></i>權限設定
          </button>
          <button
            v-if="type === 'note' || type === 'book'"
            @click="emit('update:tab', 'share')"
            :class="tab === 'share' ? 'text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            class="w-full px-4 py-3 text-left text-sm font-medium transition flex items-center cursor-pointer"
          >
            <i class="fa-solid fa-share-nodes mr-2"></i>{{ type === 'book' ? '分享書本' : '分享筆記' }}
          </button>
          <button
            v-if="type === 'note' && item?.canEdit && ['markdown', 'excalidraw', 'drawio'].includes(item?.noteType)"
            @click="emit('update:tab', 'data')"
            :class="tab === 'data' ? 'text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            class="w-full px-4 py-3 text-left text-sm font-medium transition flex items-center cursor-pointer"
          >
            <i class="fa-solid fa-file-export mr-2"></i>資料管理
          </button>
        </div>

        <!-- Right Content Area -->
        <div class="flex-1 overflow-y-auto">
          <!-- Info Tab Content -->
          <div v-show="tab === 'info'" class="p-4 space-y-4">
            <!-- Title Section -->
            <div>
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                <i :class="type === 'book' ? 'fa-solid fa-book' : (item?.noteType === 'excalidraw' ? 'fa-solid fa-chalkboard' : item?.noteType === 'drawio' ? 'fa-solid fa-project-diagram' : 'fa-solid fa-note-sticky')" class="mr-1"></i> 標題
              </label>
              <!-- Editable title for books and non-markdown notes (excalidraw, drawio) -->
              <input
                v-if="(type === 'book' && item?.canEdit) || (type === 'note' && (item?.noteType === 'excalidraw' || item?.noteType === 'drawio') && item?.canEdit)"
                :value="item?.title || ''"
                @blur="emit('update:title', $event.target.value)"
                type="text"
                placeholder="輸入標題..."
                class="w-full px-3 py-2 text-sm font-bold border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <!-- Read-only title display -->
              <div v-else class="px-3 py-2 text-sm font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded">
                {{ item?.title || 'Untitled' }}
              </div>
            </div>

            <!-- Item Info -->
            <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm">
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                ID：<span class="font-mono text-gray-700 dark:text-gray-300">{{ item?.id }}</span>
              </div>
              <!-- Note Type (for notes only) -->
              <div v-if="type === 'note'" class="text-gray-500 dark:text-gray-400 mb-1">
                筆記類別：
                <span class="text-gray-700 dark:text-gray-300">
                  <i :class="item?.noteType === 'excalidraw' ? 'fa-solid fa-chalkboard text-purple-500' : (item?.noteType === 'drawio' ? 'fa-solid fa-project-diagram text-teal-500' : 'fa-brands fa-markdown text-blue-500')" class="mr-1"></i>
                  {{ item?.noteType === 'excalidraw' ? '白板' : (item?.noteType === 'drawio' ? '流程圖' : 'Markdown') }}
                </span>
              </div>
              <!-- Creator / Owner -->
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                建立者：
                <span class="text-gray-700 dark:text-gray-300">{{ item?.owner?.username || '(未知)' }}</span>
              </div>
              <!-- Created Time -->
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                建立時間：<span class="text-gray-700 dark:text-gray-300">{{ formatDate(item?.createdAt) }}</span>
              </div>
              <!-- Last Updater -->
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                最後更新者：
                <span class="text-gray-700 dark:text-gray-300">{{ item?.lastUpdater?.username || item?.owner?.username || '(未知)' }}</span>
              </div>
              <!-- Last Updated Time -->
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                最後更新時間：<span class="text-gray-700 dark:text-gray-300">{{ formatDate(item?.updatedAt) }}</span>
              </div>
              <!-- Note Only: Last Editor and Last Edited Time -->
              <template v-if="type === 'note'">
                <div class="text-gray-500 dark:text-gray-400 mb-1">
                  最後編輯者：
                  <span class="text-gray-700 dark:text-gray-300">{{ item?.lastEditor?.username || item?.owner?.username || '(未知)' }}</span>
                </div>
                <div class="text-gray-500 dark:text-gray-400 mb-1">
                  最後編輯時間：<span class="text-gray-700 dark:text-gray-300">{{ formatDate(item?.lastEditedAt) }}</span>
                </div>
              </template>
            </div>

            <!-- Description (for books) -->
            <div v-if="type === 'book'">
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                <i class="fa-solid fa-align-left mr-1"></i> 描述
              </label>
              <textarea
                v-if="item?.canEdit"
                :value="editableDescription"
                @blur="emit('update:description', $event.target.value)"
                rows="3"
                placeholder="輸入描述..."
                class="w-full px-3 py-2 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              ></textarea>
              <p v-else class="text-gray-700 dark:text-gray-300 text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded">
                {{ editableDescription || '無描述' }}
              </p>
            </div>

            <!-- Book Info (for notes) -->
            <div v-if="type === 'note'" class="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm mb-2">
              <div class="text-gray-500 dark:text-gray-400 mb-2 font-medium">
                <i class="fa-solid fa-book mr-1"></i>所屬書本
              </div>
              <div class="flex items-center gap-2">
                <select
                  v-model="selectedMoveBookId"
                  class="flex-1 px-2 py-1.5 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">(未分類筆記)</option>
                  <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title }}</option>
                </select>
                <button
                  @click="moveNote"
                  class="px-3 py-1.5 border border-blue-500 text-blue-500 rounded hover:text-white hover:bg-blue-600 transition text-xs whitespace-nowrap cursor-pointer"
                >
                  移動
                </button>
              </div>
            </div>

            <!-- Tags Section -->
            <div v-if="editableTags !== undefined">
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                <i class="fa-solid fa-tags mr-1"></i> 標籤
              </label>
              <div class="flex flex-wrap gap-2 mb-2">
                <span
                  v-for="tag in editableTags"
                  :key="tag"
                  :class="type === 'book' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : (item?.noteType === 'excalidraw' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300')"
                  class="px-3 py-1 text-sm rounded-full flex items-center"
                >
                  {{ tag }}
                  <!-- Allow remove for books and whiteboard notes -->
                  <button v-if="canEditTags" @click="emit('remove-tag', tag)" class="ml-2 hover:text-red-500 cursor-pointer">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
                <span v-if="editableTags.length === 0" class="text-gray-400 text-sm italic">無標籤</span>
              </div>
              <!-- Tag input for books and whiteboard notes -->
              <div v-if="canEditTags" class="flex gap-2">
                <input
                  :value="newTagInput"
                  @input="emit('update:newTag', $event.target.value)"
                  @keyup.enter="emit('add-tag')"
                  type="text"
                  placeholder="輸入新標籤..."
                  class="flex-1 px-3 py-2 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button @click="emit('add-tag')" class="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition cursor-pointer">
                  <i class="fa-solid fa-plus"></i>
                </button>
              </div>
              <!-- Info message only for markdown notes -->
              <div v-if="type === 'note' && item?.noteType == 'markdown'" class="flex flex-wrap gap-2 mt-2 mb-2">
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    <i class="fa-solid fa-info-circle mr-1"></i>
                    筆記標籤需在筆記內容中使用 <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">###### tags: `標籤名稱`</code> 語法進行編輯。
                  </p>
              </div>
            </div>

            <!-- Comments Toggle (for markdown notes only, Owner only - whiteboards don't have comments) -->
            <div v-if="type === 'note' && item?.noteType == 'markdown' && item?.isOwner" class="border-t border-gray-300 dark:border-gray-700 pt-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <i class="fa-solid fa-comments text-gray-500 mr-2"></i>
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">留言功能</span>
                </div>
                <label class="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="commentsEnabled"
                    @change="emit('update:commentsEnabled', $event.target.checked)"
                    class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">{{ commentsEnabled ? '開啟' : '關閉' }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Permission Tab Content -->
          <div v-show="tab === 'permission'" class="p-4">
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">目前權限</label>
              <select
                v-if="item?.isOwner"
                :value="editablePermission"
                @change="emit('update:permission', $event.target.value)"
                class="w-full px-3 py-2 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option v-if="type === 'note' && item?.bookId" value="inherit">繼承書本權限</option>
                <option value="public-edit">可編輯</option>
                <option value="auth-edit">可編輯(需登入)</option>
                <option value="public-view">唯讀</option>
                <option value="auth-view">唯讀(需登入)</option>
                <option value="private">私人</option>
              </select>
              <div v-else class="text-gray-700 dark:text-gray-300 text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded">
                {{ getPermissionLabel(item?.permission) }}
              </div>
              <p v-if="!item?.isOwner" class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <i class="fa-solid fa-info-circle mr-1"></i>
                只有擁有者可以變更權限設定。
              </p>
            </div>

            <!-- Public Toggle -->
            <div v-if="item?.isOwner" class="border-t border-gray-300 dark:border-gray-600 pt-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <i class="fa-solid fa-globe text-gray-500 mr-2"></i>
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">公開到首頁</span>
                </div>
                <label class="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="item?.isPublic"
                    @change="emit('update:isPublic', $event.target.checked)"
                    class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">{{ item?.isPublic ? '是' : '否' }}</span>
                </label>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                開啟後，此{{ type === 'book' ? '書本' : '筆記' }}將會顯示在首頁的「公開項目」列表中。
              </p>
            </div>
          </div>

          <!-- Share Tab Content -->
          <div v-show="tab === 'share' && (type === 'note' || type === 'book')" class="p-4">
            <!-- Share Link Section -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">分享連結</label>
              
              <div v-if="shareUrl">
                <div class="flex items-center gap-2 mb-2">
                  <input type="text" :value="shareUrl" readonly
                    class="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                </div>
                
                <div class="flex gap-2">
                  <button @click="copyShareLink" class="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition flex items-center justify-center gap-2 cursor-pointer">
                    <i :class="shareCopied ? 'fa-solid fa-check' : 'fa-regular fa-copy'"></i>
                    {{ shareCopied ? '已複製' : '複製連結' }}
                  </button>
                  <a :href="shareUrl" target="_blank" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    開啟分享頁面
                  </a>
                </div>
              </div>
              
              <div v-else class="flex flex-col items-center justify-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-4 text-2xl">
                  <i class="fa-solid fa-share-nodes"></i>
                </div>
                <h3 class="text-lg font-medium text-gray-800 dark:text-white mb-2">尚未建立分享連結</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 max-w-xs">
                  透過分享連結進入的頁面，更適合閱讀。
                </p>
                <button @click="generateShareLink" :disabled="generatingShare" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-lg shadow-blue-500/30 flex items-center cursor-pointer disabled:opacity-50">
                  <i v-if="generatingShare" class="fa-solid fa-spinner fa-spin mr-2"></i>
                  <i v-else class="fa-solid fa-link mr-2"></i>
                  建立分享連結
                </button>
              </div>
            </div>
            
            <!-- Alias Section -->
            <div class="mb-6 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div class="flex items-center justify-between mb-3">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">自訂別名</label>
                <button @click="toggleAlias" 
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
                  :class="aliasEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'">
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="aliasEnabled ? 'translate-x-6' : 'translate-x-1'"></span>
                </button>
              </div>
              
              <div v-if="aliasEnabled" class="space-y-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ type === 'book' ? '/v/' : '/s/' }}</span>
                  <input type="text" v-model="aliasInput" 
                    @input="aliasError = ''"
                    placeholder="my-tutorial"
                    class="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    :class="{'border-red-500 dark:border-red-500': aliasError}">
                  <button v-if="currentAlias" @click="copyAliasUrl" 
                    class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm cursor-pointer"
                    :title="aliasCopied ? '已複製' : '複製別名網址'">
                    <i :class="aliasCopied ? 'fa-solid fa-check text-green-500' : 'fa-regular fa-copy'"></i>
                  </button>
                  <button @click="saveAlias" 
                    :disabled="aliasSaving"
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm cursor-pointer disabled:opacity-50">
                    <i v-if="aliasSaving" class="fa-solid fa-spinner fa-spin"></i>
                    <span v-else>儲存</span>
                  </button>
                </div>
                <p v-if="aliasError" class="text-xs text-red-500">{{ aliasError }}</p>
                <p v-if="currentAlias && !aliasError" class="text-xs text-green-600 dark:text-green-400">
                  <i class="fa-solid fa-check mr-1"></i>
                  別名網址可用: {{ type === 'book' ? '/v/' : '/s/' }}{{ currentAlias }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  只能使用小寫英文、數字、連字號(-)和底線(_)
                </p>
              </div>
            </div>
            
            <!-- Reset Share Link Section -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div class="flex flex-col gap-2">
                <p class="text-xs text-amber-600 dark:text-amber-500">
                  <i class="fa-solid fa-triangle-exclamation mr-1"></i>
                  重設連結後，原有的分享連結將立即失效，無法再存取。
                </p>
                <button @click="resetShareLink" :disabled="resettingShare" class="w-full px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50">
                  <i v-if="resettingShare" class="fa-solid fa-spinner fa-spin"></i>
                  <i v-else class="fa-solid fa-arrows-rotate"></i>
                  重設分享連結
                </button>
              </div>
            </div>
          </div>

          <!-- Data Management Tab Content -->
          <div v-show="tab === 'data'" class="p-4 space-y-4">
            <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">匯出筆記</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">選擇匯出格式：</p>
            <div class="grid grid-cols-2 gap-4 px-2" v-if="item?.noteType === 'markdown'">
              <!-- Markdown Export -->
              <button @click="emit('export-markdown')" 
                      class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition cursor-pointer group">
                <i class="fa-brands fa-markdown text-4xl text-gray-400 group-hover:text-blue-500 mb-3 transition"></i>
                <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">Markdown</span>
                <span class="text-xs text-gray-400 mt-1">.md 檔案</span>
              </button>
              <!-- PDF Export -->
              <button @click="emit('export-pdf')" 
                      class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer group">
                <i class="fa-solid fa-file-pdf text-4xl text-gray-400 group-hover:text-red-500 mb-3 transition"></i>
                <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400">PDF</span>
                <span class="text-xs text-gray-400 mt-1">.pdf 檔案</span>
              </button>
            </div>

            <!-- Excalidraw Export Options -->
            <div v-if="item?.noteType === 'excalidraw'" class="space-y-4">
              <div class="mx-2 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs flex items-start">
                <i class="fa-solid fa-circle-info mt-0.5 mr-2 shrink-0"></i>
                <span>建議使用畫面中左上角選單內的匯出功能，可獲得更多進階選項（如透明背景、縮放比例等）。</span>
              </div>

              <div class="grid grid-cols-2 gap-4 px-2">
                <!-- Excalidraw File -->
                <button @click="emit('export-whiteboard')" 
                        class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition cursor-pointer group col-span-2">
                  <i class="fa-solid fa-pen-ruler text-4xl text-gray-400 group-hover:text-purple-500 mb-3 transition"></i>
                  <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-purple-600 dark:group-hover:text-purple-400">Excalidraw</span>
                  <span class="text-xs text-gray-400 mt-1">.excalidraw 原始檔</span>
                </button>
                <!-- PNG Export -->
                <button @click="emit('export-whiteboard-png')" 
                        class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition cursor-pointer group">
                  <i class="fa-solid fa-image text-4xl text-gray-400 group-hover:text-blue-500 mb-3 transition"></i>
                  <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">PNG</span>
                  <span class="text-xs text-gray-400 mt-1">圖片檔</span>
                </button>
                <!-- SVG Export -->
                <button @click="emit('export-whiteboard-svg')" 
                        class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition cursor-pointer group">
                  <i class="fa-solid fa-bezier-curve text-4xl text-gray-400 group-hover:text-orange-500 mb-3 transition"></i>
                  <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-orange-600 dark:group-hover:text-orange-400">SVG</span>
                  <span class="text-xs text-gray-400 mt-1">向量圖檔</span>
                </button>
              </div>
            </div>

            <!-- Drawio Export Options -->
            <div v-if="item?.noteType === 'drawio'" class="space-y-4">
              <div class="mx-2 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs flex items-start">
                <i class="fa-solid fa-circle-info mt-0.5 mr-2 shrink-0"></i>
                <span>建議使用畫面中左上角 "檔案" 選單內的匯出功能，可獲得更多進階選項（如圖片設定、透明背景等）。</span>
              </div>

              <div class="grid grid-cols-2 gap-4 px-2">
                <!-- Drawio File -->
                <button @click="emit('export-flowchart')" 
                        class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition cursor-pointer group">
                  <i class="fa-solid fa-project-diagram text-4xl text-gray-400 group-hover:text-orange-500 mb-3 transition"></i>
                  <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-orange-600 dark:group-hover:text-orange-400">Draw.io</span>
                  <span class="text-xs text-gray-400 mt-1">.drawio 原始檔</span>
                </button>
                <!-- SVG Export -->
                <button @click="emit('export-flowchart-svg')" 
                        class="flex flex-col items-center justify-center p-6 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition cursor-pointer group">
                  <i class="fa-solid fa-bezier-curve text-4xl text-gray-400 group-hover:text-green-500 mb-3 transition"></i>
                  <span class="font-semibold text-gray-700 dark:text-gray-300 group-hover:text-green-600 dark:group-hover:text-green-400">SVG</span>
                  <span class="text-xs text-gray-400 mt-1">向量圖檔</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-end p-4 border-t border-gray-300 dark:border-gray-700 shrink-0">
        <button @click="emit('close')" class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
          關閉
        </button>
      </div>
    </div>
  </div>
</template>
