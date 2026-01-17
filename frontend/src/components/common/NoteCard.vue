<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  note: { type: Object, required: true },
  mode: { type: String, default: 'grid' },
  showMenu: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  showMoveOption: { type: Boolean, default: true }
})

const emit = defineEmits(['toggle-menu', 'open-info', 'toggle-pin', 'open-move', 'delete', 'click'])

const formatDate = (date) => {
  return window.dayjs ? window.dayjs(date).format('YYYY/MM/DD HH:mm') : new Date(date).toLocaleDateString()
}
</script>

<template>
  <!-- Grid Mode -->
  <div
    v-if="mode === 'grid'"
    class="group relative bg-white dark:bg-dark-surface px-6 py-4 rounded-lg shadow hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-xl cursor-pointer transition border border-gray-200 dark:border-gray-700 h-[140px] flex flex-col justify-center"
    @click="emit('click')"
  >
    <!-- Dropdown Menu Button -->
    <div class="absolute top-2 right-2">
      <button
        @click.stop="emit('toggle-menu')"
        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <!-- Dropdown Menu -->
      <div
        v-if="showMenu"
        class="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[100]"
      >
        <button
          @click.stop="emit('open-info')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg cursor-pointer"
        >
          <i class="fa-solid fa-circle-info w-4 mr-1 inline-block text-center"></i>資訊
        </button>
        <button
          v-if="showMoveOption"
          @click.stop="emit('open-move')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <i class="fa-solid fa-folder-open w-4 mr-1 inline-block text-center"></i>移動至...
        </button>
        <!-- [DISABLED] 釘選功能暫時停用
        <button
          @click.stop="emit('toggle-pin')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <i class="fa-solid fa-thumbtack w-4 mr-1 inline-block text-center"></i>{{ isPinned ? '取消釘選' : '釘選到側邊欄' }}
        </button>
        -->
        <button
          @click.stop="note.canDelete && emit('delete')"
          :class="note.canDelete ? 'text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' : 'text-gray-400 cursor-not-allowed'"
          class="w-full px-4 py-2 text-left text-sm rounded-b-lg"
          :disabled="!note.canDelete"
        >
          <i class="fa-solid fa-trash w-4 mr-1 inline-block text-center"></i>刪除
        </button>
      </div>
    </div>

    <div class="flex items-center mb-1">
      <span class="w-6 mr-2 text-center shrink-0 text-lg">
        <i v-if="note.noteType === 'excalidraw'" class="fa-solid fa-chalkboard text-purple-500"></i>
        <i v-else-if="note.noteType === 'drawio'" class="fa-solid fa-project-diagram text-teal-500"></i>
        <i v-else class="fa-solid fa-note-sticky text-blue-500"></i>
      </span>
      <h3 class="font-bold text-lg text-gray-800 dark:text-white truncate" :title="note.title || 'Untitled'">
        {{ note.title || 'Untitled' }}
      </h3>
    </div>

    <div class="mb-2">
      <p class="text-gray-500 dark:text-gray-400 text-sm" title="最後編輯時間">
        {{ formatDate(note.lastEditedAt || note.updatedAt) }}
      </p>
      <p v-if="note.lastEditor || note.owner" class="text-gray-400 dark:text-gray-500 text-xs">
        by {{ note.lastEditor?.username || note.owner?.username }}
      </p>
    </div>

    <!-- Tags -->
    <div class="h-[22px] overflow-hidden">
      <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1">
        <span
          v-for="tag in note.tags.slice(0, 3)"
          :key="tag"
          class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
        >
          {{ tag }}
        </span>
        <span
          v-if="note.tags.length > 3"
          class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
          :title="note.tags.slice(3).join(', ')"
        >
          +{{ note.tags.length - 3 }}
        </span>
      </div>
    </div>
  </div>

  <!-- List Mode -->
  <div
    v-else
    class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border border-gray-100 dark:border-gray-700 transition group relative h-[70px]"
    @click="emit('click')"
  >
    <!-- Icon -->
    <div class="w-10 text-center text-xl mr-3 flex-shrink-0" :class="note.noteType === 'excalidraw' ? 'text-purple-500' : (note.noteType === 'drawio' ? 'text-teal-500' : 'text-blue-500')">
      <i v-if="note.noteType === 'excalidraw'" class="fa-solid fa-chalkboard"></i>
      <i v-else-if="note.noteType === 'drawio'" class="fa-solid fa-project-diagram"></i>
      <i v-else class="fa-solid fa-note-sticky"></i>
    </div>

    <!-- Main Info -->
    <div class="flex-1 min-w-0">
      <h3 class="font-bold text-gray-800 dark:text-white truncate text-base mb-1" :title="note.title || 'Untitled'">
        {{ note.title || 'Untitled' }}
      </h3>
      <div class="h-[20px] overflow-hidden">
        <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="tag in note.tags.slice(0, 6)"
            :key="tag"
            class="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex-shrink-0"
          >
            {{ tag }}
          </span>
          <span
            v-if="note.tags.length > 6"
            class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 flex-shrink-0"
            :title="note.tags.slice(6).join(', ')"
          >
            +{{ note.tags.length - 6 }}
          </span>
        </div>
      </div>
    </div>

    <!-- Date and User -->
    <div class="text-right shrink-0 mr-4 text-xs text-gray-500 dark:text-gray-400">
      <div>{{ formatDate(note.lastEditedAt || note.updatedAt) }}</div>
      <div v-if="note.lastEditor || note.owner">by {{ note.lastEditor?.username || note.owner?.username }}</div>
    </div>

    <!-- Context Menu Button -->
    <div class="relative shrink-0">
      <button
        @click.stop="emit('toggle-menu')"
        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <!-- Dropdown Menu -->
      <div
        v-if="showMenu"
        class="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[100]"
      >
        <button
          @click.stop="emit('open-info')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg cursor-pointer"
        >
          <i class="fa-solid fa-circle-info w-4 mr-2 inline-block text-center"></i>資訊
        </button>
        <!-- [DISABLED] 釘選功能暫時停用
        <button
          @click.stop="emit('toggle-pin')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <i class="fa-solid fa-thumbtack w-4 mr-2 inline-block text-center"></i>
          {{ isPinned ? '取消釘選' : '釘選到側邊欄' }}
        </button>
        -->
        <button
          v-if="showMoveOption"
          @click.stop="emit('open-move')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <i class="fa-solid fa-folder-open w-4 mr-2 inline-block text-center"></i>移動至...
        </button>
        <button
          @click.stop="note.canDelete && emit('delete')"
          :class="note.canDelete ? 'text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' : 'text-gray-400 cursor-not-allowed'"
          class="w-full px-4 py-2 text-left text-sm rounded-b-lg"
          :disabled="!note.canDelete"
        >
          <i class="fa-solid fa-trash w-4 mr-2 inline-block text-center"></i>刪除
        </button>
      </div>
    </div>
  </div>
</template>
