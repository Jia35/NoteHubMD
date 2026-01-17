<script setup>
/**
 * AI Assistant Chat Window
 * 聊天視窗 - 使用純 fetch 實作串流聊天
 */
import { ref, watch, nextTick, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'

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

const emit = defineEmits(['close'])

const messagesContainer = ref(null)
const input = ref('')
const messages = ref([])
const isLoading = ref(false)
const error = ref(null)
const suggestedQuestions = ref([])
const welcomeMessage = ref('向 AI 詢問關於此筆記的問題')
const loadingSuggestions = ref(false)

// Initialize markdown-it for rendering AI responses
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
})

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9)

// Render markdown content
const renderMarkdown = (content) => {
  return md.render(content || '')
}

// Copy message content to clipboard
const copyMessage = async (content) => {
  try {
    await navigator.clipboard.writeText(content)
    // Could add toast notification here
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

// Regenerate response for a specific message
const regenerateMessage = async (messageIndex) => {
  if (isLoading.value) return
  
  // Find the user message before this assistant message
  const assistantMsg = messages.value[messageIndex]
  if (assistantMsg.role !== 'assistant') return
  
  // Remove the assistant message
  messages.value.splice(messageIndex, 1)
  
  // Find the last user message
  const lastUserMsgIndex = messages.value.length - 1
  if (lastUserMsgIndex < 0 || messages.value[lastUserMsgIndex].role !== 'user') return
  
  // Re-send the request
  isLoading.value = true
  error.value = null
  
  // Create new assistant message placeholder
  const newAssistantMessage = {
    id: generateId(),
    role: 'assistant',
    content: ''
  }
  messages.value.push(newAssistantMessage)
  
  try {
    abortController = new AbortController()
    
    const apiMessages = messages.value
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => ({ role: m.role, content: m.content }))
    
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        noteContent: props.noteContent
      }),
      signal: abortController.signal
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'AI request failed')
    }
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('0:')) {
          try {
            const text = JSON.parse(line.slice(2))
            newAssistantMessage.content += text
          } catch (e) {
            newAssistantMessage.content += line.slice(2)
          }
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      error.value = e
      messages.value.pop()
    }
  } finally {
    isLoading.value = false
    abortController = null
  }
}

// Auto-scroll to bottom when new messages arrive
watch(messages, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}, { deep: true })

// Abort controller for canceling requests
let abortController = null

// Load suggested questions from AI config
const loadSuggestedQuestions = async () => {
  loadingSuggestions.value = true
  try {
    const response = await fetch('/api/ai/settings')
    if (response.ok) {
      const config = await response.json()
      
      // Set welcome message
      if (config.welcomeMessage) {
        welcomeMessage.value = config.welcomeMessage
      }
      
      const questions = config.suggestedQuestions || []
      
      // Process questions: fetch AI-generated ones if needed
      const processedQuestions = []
      const autoGenerateQuestions = questions.filter(q => q.autoGenerate)
      const manualQuestions = questions.filter(q => !q.autoGenerate && q.displayText)
      
      // Add manual questions first
      processedQuestions.push(...manualQuestions)
      
      // If there are auto-generate questions, fetch AI suggestions
      if (autoGenerateQuestions.length > 0 && props.noteContent) {
        try {
          const suggestResponse = await fetch('/api/ai/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ noteContent: props.noteContent })
          })
          if (suggestResponse.ok) {
            const suggestData = await suggestResponse.json()
            processedQuestions.push(...(suggestData.questions || []))
          }
        } catch (e) {
          console.error('Failed to fetch AI suggestions:', e)
        }
      }
      
      suggestedQuestions.value = processedQuestions.slice(0, 5)
    }
  } catch (e) {
    console.error('Failed to load suggested questions:', e)
  } finally {
    loadingSuggestions.value = false
  }
}

// Use a suggested question
const useSuggestedQuestion = (question) => {
  input.value = question.promptText || question.displayText
  sendMessage()
}

// Load suggestions on mount
onMounted(() => {
  loadSuggestedQuestions()
})

// Send message to AI
const sendMessage = async () => {
  if (!input.value.trim() || isLoading.value) return
  
  const userMessage = {
    id: generateId(),
    role: 'user',
    content: input.value.trim()
  }
  
  messages.value.push(userMessage)
  input.value = ''
  isLoading.value = true
  error.value = null
  
  // Create assistant message placeholder
  const assistantMessage = {
    id: generateId(),
    role: 'assistant',
    content: ''
  }
  messages.value.push(assistantMessage)
  
  try {
    abortController = new AbortController()
    
    // Build messages array for API (excluding empty assistant messages)
    const apiMessages = messages.value
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => ({ role: m.role, content: m.content }))
    
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: apiMessages,
        noteContent: props.noteContent
      }),
      signal: abortController.signal
    })
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'AI request failed')
    }
    
    // Handle streaming response
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value, { stream: true })
      // Parse AI SDK stream format (data: prefix with JSON)
      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('0:')) {
          // Text content - remove the prefix and parse JSON string
          try {
            const text = JSON.parse(line.slice(2))
            assistantMessage.content += text
          } catch (e) {
            // Not JSON, just append
            assistantMessage.content += line.slice(2)
          }
        }
      }
      
      // Trigger reactivity
      messages.value = [...messages.value]
    }
    
  } catch (e) {
    if (e.name === 'AbortError') {
      // Request was cancelled
      return
    }
    error.value = e
    // Remove empty assistant message on error
    if (!assistantMessage.content) {
      messages.value = messages.value.filter(m => m.id !== assistantMessage.id)
    }
  } finally {
    isLoading.value = false
    abortController = null
  }
}

// Stop generation
const stop = () => {
  if (abortController) {
    abortController.abort()
    isLoading.value = false
  }
}

// Retry last message
const retry = () => {
  if (messages.value.length >= 2) {
    // Remove last assistant message
    messages.value.pop()
    // Get last user message
    const lastUserMessage = messages.value[messages.value.length - 1]
    if (lastUserMessage?.role === 'user') {
      input.value = lastUserMessage.content
      messages.value.pop()
      sendMessage()
    }
  }
}

// Handle form submit
const handleSubmit = (e) => {
  e.preventDefault()
  sendMessage()
}
</script>

<template>
  <div class="fixed bottom-18 right-5 w-96 max-w-[calc(100vw-3rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col z-50 overflow-hidden" style="height: 500px; max-height: calc(100vh - 150px);">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-robot text-lg text-gray-600 dark:text-gray-400"></i>
        <span class="font-semibold text-gray-800 dark:text-gray-200">AI 助理</span>
        <span v-if="noteTitle" class="text-xs text-gray-500 truncate max-w-32">· {{ noteTitle }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button 
          @click="messages = []; error = null"
          class="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
        >
          新對話
        </button>
        <button 
          @click="emit('close')"
          class="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
          title="關閉"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div 
      ref="messagesContainer"
      class="flex-1 overflow-y-auto p-4 space-y-4 text-sm"
    >
      <!-- Welcome Message -->
      <div v-if="messages.length === 0" class="text-center text-gray-400 py-6">
        <i class="fa-solid fa-comments text-4xl mb-3 opacity-50"></i>
        <p class="text-sm">{{ welcomeMessage }}</p>
        
        <!-- Suggested Questions -->
        <div v-if="suggestedQuestions.length > 0" class="m-4 flex flex-col gap-2">
          <button
            v-for="(q, index) in suggestedQuestions"
            :key="index"
            @click="useSuggestedQuestion(q)"
            :disabled="isLoading"
            :title="q.promptText"
            class="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer disabled:opacity-50"
          >
            {{ q.displayText }}
          </button>
        </div>
        <div v-else-if="loadingSuggestions" class="mt-4 text-xs">
          <i class="fa-solid fa-spinner fa-spin mr-1"></i>載入建議問題...
        </div>
      </div>

      <!-- Message List -->
      <div 
        v-for="message in messages" 
        :key="message.id"
        v-show="message.role === 'user' || message.content"
        class="flex gap-3"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <!-- AI Avatar -->
        <div v-if="message.role === 'assistant'" class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-robot text-white text-sm"></i>
        </div>

        <!-- Message Bubble + Action Buttons Container -->
        <div 
          class="flex flex-col min-w-0" 
          :class="message.role === 'user' ? 'items-end flex-1' : 'flex-1'"
        >
          <!-- Message Bubble -->
          <div 
            class="rounded-2xl py-2 px-4 break-words inline-block max-w-full"
            :class="message.role === 'user' 
              ? 'bg-blue-500 text-white rounded-br-md' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'"
          >
            <div 
              v-if="message.role === 'assistant'" 
              class="prose prose-sm dark:prose-invert max-w-none text-[13px]"
              v-html="renderMarkdown(message.content)"
            ></div>
            <div 
              v-else
              class="prose prose-sm prose-invert max-w-none text-[13px]"
              v-html="renderMarkdown(message.content)"
            ></div>
          </div>
          
          <!-- Action Buttons for AI messages -->
          <div 
            v-if="message.role === 'assistant' && message.content && !isLoading" 
            class="flex gap-2 mt-1"
          >
            <button 
              @click="copyMessage(message.content)"
              class="text-gray-400 hover:text-blue-500 text-sm transition-colors cursor-pointer"
              title="複製"
            >
              <i class="fa-regular fa-copy"></i>
            </button>
            <button 
              @click="regenerateMessage(messages.indexOf(message))"
              class="text-gray-400 hover:text-green-500 text-sm transition-colors cursor-pointer"
              title="重新生成"
            >
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Loading Indicator -->
      <div v-if="isLoading && (!messages.length || !messages[messages.length - 1]?.content)" class="flex gap-3 justify-start">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-robot text-white text-sm"></i>
        </div>
        <div class="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
          <div class="flex gap-1">
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
            <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
        <i class="fa-solid fa-exclamation-circle mr-2"></i>
        {{ error.message }}
        <button @click="retry" class="ml-2 underline hover:no-underline cursor-pointer">重試</button>
      </div>
    </div>

    <!-- Input -->
    <form @submit="handleSubmit" class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50">
      <div class="flex gap-2">
        <input
          v-model="input"
          type="text"
          placeholder="輸入訊息..."
          class="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          :disabled="isLoading"
        />
        <button
          v-if="isLoading"
          type="button"
          @click="stop"
          class="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition cursor-pointer"
          title="停止"
        >
          <i class="fa-solid fa-stop"></i>
        </button>
        <button
          v-else
          type="submit"
          :disabled="!input.trim()"
          class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="發送"
        >
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* Prose styling for markdown content */
.prose :deep(p) {
  margin: 0.5em 0;
}
.prose :deep(p:first-child) {
  margin-top: 0;
}
.prose :deep(p:last-child) {
  margin-bottom: 0;
}
.prose :deep(ul), .prose :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.prose :deep(ul) {
  list-style-type: disc;
}
.prose :deep(ol) {
  list-style-type: decimal;
}
.prose :deep(code) {
  background: rgba(0, 0, 0, 0.1);
  padding: 0.1em 0.3em;
  border-radius: 0.25em;
  font-size: 0.9em;
}
.prose :deep(pre) {
  background: rgba(0, 0, 0, 0.1);
  padding: 0.75em;
  border-radius: 0.5em;
  overflow-x: auto;
  margin: 0.5em 0;
}
.prose :deep(pre code) {
  background: none;
  padding: 0;
}
</style>
