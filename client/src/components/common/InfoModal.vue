<script setup>
import { ref, watch } from 'vue'

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
  'update:isPublic', 'add-tag', 'remove-tag', 'search-users', 'add-user-permission',
  'remove-user-permission', 'update-user-permission', 'move-note'
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
            v-if="type === 'note'"
            @click="emit('update:tab', 'share')"
            :class="tab === 'share' ? 'text-blue-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
            class="w-full px-4 py-3 text-left text-sm font-medium transition flex items-center cursor-pointer"
          >
            <i class="fa-solid fa-share-nodes mr-2"></i>分享筆記
          </button>
        </div>

        <!-- Right Content Area -->
        <div class="flex-1 overflow-y-auto">
          <!-- Info Tab Content -->
          <div v-show="tab === 'info'" class="p-4 space-y-4">
            <!-- Title Section -->
            <div>
              <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                <i :class="type === 'book' ? 'fa-solid fa-book' : 'fa-solid fa-note-sticky'" class="mr-1"></i> 標題
              </label>
              <input
                v-if="type === 'book' && item?.canEdit"
                :value="item?.title || ''"
                @blur="emit('update:title', $event.target.value)"
                type="text"
                placeholder="輸入標題..."
                class="w-full px-3 py-2 text-sm font-bold border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div v-else class="px-3 py-2 text-sm font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded">
                {{ item?.title || 'Untitled' }}
              </div>
            </div>

            <!-- Item Info -->
            <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm">
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                ID：<span class="font-mono text-gray-700 dark:text-gray-300">{{ item?.id }}</span>
              </div>
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                {{ type === 'book' ? '建立者' : '擁有者' }}：
                <span class="text-gray-700 dark:text-gray-300">{{ item?.owner?.username || '(未知)' }}</span>
              </div>
              <div v-if="type === 'book'" class="text-gray-500 dark:text-gray-400 mb-1">
                建立時間：<span class="text-gray-700 dark:text-gray-300">{{ formatDate(item?.createdAt) }}</span>
              </div>
              <div class="text-gray-500 dark:text-gray-400 mb-1">
                最後更新時間：<span class="text-gray-700 dark:text-gray-300">{{ formatDate(item?.updatedAt) }}</span>
              </div>
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
                  :class="type === 'book' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'"
                  class="px-3 py-1 text-sm rounded-full flex items-center"
                >
                  {{ tag }}
                  <button v-if="type === 'book' && item?.canEdit" @click="emit('remove-tag', tag)" class="ml-2 hover:text-red-500 cursor-pointer">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </span>
                <span v-if="editableTags.length === 0" class="text-gray-400 text-sm italic">無標籤</span>
              </div>
              <div v-if="type === 'book' && item?.canEdit" class="flex gap-2">
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
            </div>

            <!-- Comments Toggle (for notes, Owner only) -->
            <div v-if="type === 'note' && item?.isOwner" class="border-t border-gray-300 dark:border-gray-700 pt-4">
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
          <div v-show="tab === 'share' && type === 'note'" class="p-4">
            <slot name="share-content"></slot>
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
