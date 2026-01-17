<script setup>
/**
 * CreateBookModal - 建立書本 Modal
 */
import { ref, watch } from 'vue'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close', 'book-created'])

const title = ref('')
const description = ref('')
const titleInput = ref(null)

watch(() => props.show, (newVal) => {
  if (newVal) {
    title.value = ''
    description.value = ''
    // Focus on title input after modal opens
    setTimeout(() => titleInput.value?.focus(), 100)
  }
})

const handleCreate = () => {
  if (!title.value.trim()) return
  emit('book-created', {
    title: title.value.trim(),
    description: description.value.trim()
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-md mx-4">
        <div class="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-800 dark:text-white">
            <i class="fa-solid fa-book mr-2"></i> 新增書本
          </h2>
          <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              標題 <span class="text-red-500">*</span>
            </label>
            <input
              v-model="title"
              ref="titleInput"
              type="text"
              placeholder="輸入書本標題..."
              class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500"
              @keyup.enter="handleCreate"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              描述
            </label>
            <textarea
              v-model="description"
              rows="3"
              placeholder="輸入描述..."
              class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
          <button @click="emit('close')" class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
            取消
          </button>
          <button @click="handleCreate" :disabled="!title.trim()" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50 cursor-pointer">
            <i class="fa-solid fa-plus mr-1"></i>建立
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
