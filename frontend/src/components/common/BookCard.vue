<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  book: { type: Object, required: true },
  mode: { type: String, default: 'grid' },
  inGrid: { type: Boolean, default: false }, // When true, use auto width for CSS grid layouts
  showMenu: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-menu', 'open-info', 'toggle-pin', 'delete', 'click'])

const menuButton = ref(null)

const menuStyle = computed(() => {
  if (!menuButton.value || !props.showMenu) return {}
  const rect = menuButton.value.getBoundingClientRect()
  return {
    top: `${rect.bottom + 4}px`,
    left: `${rect.right - 144}px`
  }
})

const formatDate = (date) => {
  return window.dayjs ? window.dayjs(date).format('YYYY/MM/DD HH:mm') : new Date(date).toLocaleDateString()
}
</script>

<template>
  <!-- Grid Mode -->
  <div
    v-if="mode === 'grid'"
    :class="[
      'group relative bg-white dark:bg-dark-surface p-6 rounded-lg shadow hover:shadow-xl cursor-pointer transition border border-gray-200 dark:border-gray-700',
      inGrid ? 'w-auto' : 'w-80 shrink-0'
    ]"
    @click="emit('click')"
  >
    <!-- Dropdown Menu Button -->
    <div class="absolute top-2 right-2" ref="menuButton">
      <button
        @click.stop="emit('toggle-menu')"
        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    </div>

    <!-- Dropdown Menu -->
    <Teleport to="body">
      <div
        v-if="showMenu"
        class="fixed w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[100]"
        :style="menuStyle"
      >
        <button
          @click.stop="emit('open-info')"
          class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg cursor-pointer"
        >
          <i class="fa-solid fa-circle-info w-4 mr-1 inline-block text-center"></i>資訊
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
          @click.stop="book.canDelete && emit('delete')"
          :class="book.canDelete ? 'text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' : 'text-gray-400 cursor-not-allowed'"
          class="w-full px-4 py-2 text-left text-sm rounded-b-lg"
          :disabled="!book.canDelete"
        >
          <i class="fa-solid fa-trash w-4 mr-1 inline-block text-center"></i>刪除
        </button>
      </div>
    </Teleport>

    <!-- Book Info -->
    <div class="flex items-center mb-1">
      <span class="w-6 mr-2 text-center shrink-0 text-lg">
        <i class="fa-solid fa-book text-green-500"></i>
      </span>
      <h3 class="font-bold text-lg text-gray-800 dark:text-white truncate" :title="book.title + ' (' + (book.noteCount ?? 0) + ')'">
        {{ book.title }} ({{ book.noteCount ?? 0 }})
      </h3>
    </div>

    <div class="mb-2">
      <p class="text-gray-500 dark:text-gray-400 text-sm" title="最後編輯時間">
        {{ formatDate(book.updatedAt) }}
      </p>
      <p v-if="book.lastUpdater || book.owner" class="text-gray-400 dark:text-gray-500 text-xs">
        by {{ book.lastUpdater?.username || book.owner?.username }}
      </p>
      <p class="text-gray-500 dark:text-gray-400 text-sm truncate">{{ book.description || '' }}</p>
    </div>

    <!-- Tags -->
    <div v-if="book.tags && book.tags.length > 0" class="flex flex-wrap gap-1">
      <span
        v-for="tag in book.tags.slice(0, 3)"
        :key="tag"
        class="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
      >
        {{ tag }}
      </span>
      <span
        v-if="book.tags.length > 3"
        class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
        :title="book.tags.slice(3).join(', ')"
      >
        +{{ book.tags.length - 3 }}
      </span>
    </div>
  </div>

  <!-- List Mode -->
  <div
    v-else
    class="flex items-center p-3 bg-white dark:bg-dark-surface rounded shadow hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer border border-gray-100 dark:border-gray-700 transition group relative h-[70px]"
    @click="emit('click')"
  >
    <!-- Icon -->
    <div class="w-10 text-center text-xl mr-3 text-green-500 flex-shrink-0">
      <i class="fa-solid fa-book"></i>
    </div>

    <!-- Main Info -->
    <div class="flex-1 min-w-0">
      <h3 class="font-bold text-gray-800 dark:text-white truncate text-base mb-1" :title="book.title + ' (' + (book.noteCount ?? 0) + ')'">
        {{ book.title }} ({{ book.noteCount ?? 0 }})
      </h3>
      <!-- Tags below title (fixed height) -->
      <div class="h-[20px] overflow-hidden">
        <div v-if="book.tags && book.tags.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="tag in book.tags.slice(0, 6)"
            :key="tag"
            class="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 flex-shrink-0"
          >
            {{ tag }}
          </span>
          <span
            v-if="book.tags.length > 6"
            class="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 flex-shrink-0"
            :title="book.tags.slice(6).join(', ')"
          >
            +{{ book.tags.length - 6 }}
          </span>
        </div>
      </div>
    </div>

    <!-- Date and User (right side, stacked) -->
    <div class="text-right shrink-0 mr-4 text-xs text-gray-500 dark:text-gray-400">
      <div>{{ formatDate(book.updatedAt) }}</div>
      <div v-if="book.lastUpdater || book.owner">by {{ book.lastUpdater?.username || book.owner?.username }}</div>
    </div>

    <!-- Context Menu Button -->
    <div class="relative shrink-0" ref="menuButton">
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
          <i class="fa-solid fa-thumbtack w-4 mr-2 inline-block text-center"></i>{{ isPinned ? '取消釘選' : '釘選到側邊欄' }}
        </button>
        -->
        <button
          @click.stop="book.canDelete && emit('delete')"
          :class="book.canDelete ? 'text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' : 'text-gray-400 cursor-not-allowed'"
          class="w-full px-4 py-2 text-left text-sm rounded-b-lg"
          :disabled="!book.canDelete"
        >
          <i class="fa-solid fa-trash w-4 mr-2 inline-block text-center"></i>刪除
        </button>
      </div>
    </div>
  </div>
</template>
