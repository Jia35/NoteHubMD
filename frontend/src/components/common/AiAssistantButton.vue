<script setup>
/**
 * AI Assistant Floating Button
 * 懸浮按鈕 - 切換 AI 聊天視窗顯示
 */
import { ref } from 'vue'
import AiAssistantChat from './AiAssistantChat.vue'
import logo from '@/assets/images/logo.png'

const props = defineProps({
  noteContent: {
    type: String,
    default: ''
  },
  noteTitle: {
    type: String,
    default: ''
  }
})

const isOpen = ref(false)

const toggleChat = () => {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <!-- Only show if AI is enabled (controlled by parent) -->
  <div>
    <!-- Floating Button -->
    <button
      @click="toggleChat"
      class="fixed bottom-4 right-5 w-12 h-12 rounded-full bg-white/80 dark:bg-gray-800/50 
             border border-gray-200 dark:border-gray-500 shadow-sm hover:bg-white dark:hover:bg-gray-700 
             hover:shadow-md transition-all duration-300 flex items-center justify-center z-30 backdrop-blur-sm"
      :class="{ 'ring-2 ring-blue-500': isOpen }"
      title="AI 助理"
    >
      <img :src="logo" alt="AI" class="w-7 h-7 rounded-full" />
    </button>

    <!-- Chat Window -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-95"
    >
      <AiAssistantChat
        v-if="isOpen"
        :note-content="noteContent"
        :note-title="noteTitle"
        @close="isOpen = false"
      />
    </Transition>
  </div>
</template>

