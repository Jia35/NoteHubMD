<script setup>
/**
 * NoteRouter - Smart router that loads the correct view based on note type
 * Determines if note is markdown or excalidraw and renders the appropriate component
 */
import { ref, onMounted, watch, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'

const route = useRoute()
const router = useRouter()

// Async components for code splitting
const NoteView = defineAsyncComponent(() => import('./NoteView.vue'))
const WhiteboardView = defineAsyncComponent(() => import('./WhiteboardView.vue'))
const FlowchartView = defineAsyncComponent(() => import('./FlowchartView.vue'))

// State
const noteType = ref(null)
const loading = ref(true)
const error = ref(null)

// Load note type
const determineNoteType = async () => {
  loading.value = true
  error.value = null
  
  try {
    const note = await api.getNote(route.params.id)
    noteType.value = note.noteType || 'markdown'
  } catch (e) {
    console.error('Failed to determine note type:', e)
    
    // Handle specific errors
    if (e.message?.includes('404') || e.message?.includes('not found')) {
      router.replace('/404')
      return
    } else if (e.message?.includes('401')) {
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
      return
    } else if (e.message?.includes('403')) {
      error.value = '您沒有權限查看此筆記'
    } else {
      // Default to markdown view for other errors
      noteType.value = 'markdown'
    }
  } finally {
    loading.value = false
  }
}

// Initial load
onMounted(() => {
  determineNoteType()
})

// Watch for ID changes
watch(() => route.params.id, (newId, oldId) => {
  if (newId !== oldId) {
    determineNoteType()
  }
})
</script>

<template>
  <!-- Loading State -->
  <div v-if="loading" class="note-router-loading">
    <div class="loading-spinner"></div>
    <span>載入中...</span>
  </div>
  
  <!-- Error State -->
  <div v-else-if="error" class="note-router-error">
    <i class="fas fa-exclamation-triangle"></i>
    <span>{{ error }}</span>
  </div>
  
  <!-- Render appropriate view based on note type -->
  <NoteView v-else-if="noteType === 'markdown'" :key="route.params.id" />
  <WhiteboardView v-else-if="noteType === 'excalidraw'" :key="route.params.id" />
  <FlowchartView v-else-if="noteType === 'drawio'" :key="route.params.id" />
</template>

<style scoped>
.note-router-loading,
.note-router-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 1rem;
  color: var(--text-secondary, #666);
}

.note-router-error {
  color: var(--danger, #dc3545);
}

.note-router-error i {
  font-size: 2rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color, #e0e0e0);
  border-top-color: var(--primary, #0066cc);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
