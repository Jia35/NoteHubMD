<script setup>
/**
 * WhiteboardView - Excalidraw whiteboard editing page
 * Similar structure to NoteView.vue but for excalidraw type notes
 */
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/composables/useApi'
import ExcalidrawWrapper from '@/components/whiteboard/ExcalidrawWrapper.vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const route = useRoute()
const router = useRouter()

// Inject global functions
const theme = inject('theme', ref('dark'))
const showAlert = inject('showAlert')

// State
const note = ref(null)
const loading = ref(true)
const saving = ref(false)
const lastSaved = ref(null)
const diagramData = ref({ elements: [], appState: {}, files: {} })
const canEdit = ref(false)
const isOwner = ref(false)
const excalidrawRef = ref(null)

// Title editing
const editingTitle = ref(false)
const titleInput = ref(null)
const localTitle = ref('')

// Computed
const noteId = computed(() => route.params.id)

const lastSavedText = computed(() => {
  if (!lastSaved.value) return ''
  return dayjs(lastSaved.value).fromNow()
})

// Load whiteboard data
const loadWhiteboard = async () => {
  loading.value = true
  try {
    const data = await api.getNote(noteId.value)
    
    // If not a whiteboard, redirect to note view
    if (data.noteType !== 'excalidraw') {
      router.replace(`/n/${noteId.value}`)
      return
    }
    
    note.value = data
    localTitle.value = data.title || 'Untitled Whiteboard'
    diagramData.value = data.diagramData || { elements: [], appState: {}, files: {} }
    canEdit.value = data.canEdit
    isOwner.value = data.isOwner
    lastSaved.value = data.lastEditedAt || data.updatedAt
  } catch (e) {
    console.error('Failed to load whiteboard:', e)
    if (e.message?.includes('404') || e.message?.includes('not found')) {
      router.replace('/404')
    } else if (e.message?.includes('401')) {
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
    } else {
      showAlert?.('載入白板失敗', 'error')
    }
  } finally {
    loading.value = false
  }
}

// Auto-save with debounce
let saveTimeout = null
const handleWhiteboardChange = (data) => {
  if (!canEdit.value || !note.value) return
  
  diagramData.value = data
  
  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  
  // Debounce save (2 seconds after last change)
  saveTimeout = setTimeout(() => {
    saveWhiteboard()
  }, 2000)
}

const saveWhiteboard = async () => {
  if (saving.value || !note.value || !canEdit.value) return
  
  saving.value = true
  try {
    await api.updateNote(note.value.id, { 
      diagramData: diagramData.value 
    })
    lastSaved.value = new Date()
  } catch (e) {
    console.error('Failed to save whiteboard:', e)
    showAlert?.('儲存失敗', 'error')
  } finally {
    saving.value = false
  }
}

// Title editing
const startEditingTitle = () => {
  if (!canEdit.value) return
  editingTitle.value = true
  setTimeout(() => {
    titleInput.value?.focus()
    titleInput.value?.select()
  }, 50)
}

const saveTitle = async () => {
  editingTitle.value = false
  if (!note.value || localTitle.value === note.value.title) return
  
  try {
    await api.updateNote(note.value.id, { title: localTitle.value })
    note.value.title = localTitle.value
  } catch (e) {
    console.error('Failed to save title:', e)
    localTitle.value = note.value.title
    showAlert?.('儲存標題失敗', 'error')
  }
}

const handleTitleKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveTitle()
  } else if (e.key === 'Escape') {
    editingTitle.value = false
    localTitle.value = note.value?.title || ''
  }
}

// Navigation
const goBack = () => {
  if (note.value?.bookId) {
    router.push(`/b/${note.value.bookId}`)
  } else {
    router.push('/')
  }
}

// Force save before leaving
const forceSave = async () => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  if (diagramData.value && canEdit.value && note.value) {
    await saveWhiteboard()
  }
}

// Lifecycle
onMounted(() => {
  loadWhiteboard()
})

onUnmounted(() => {
  // Save any pending changes
  forceSave()
})

// Watch for route changes
watch(noteId, (newId, oldId) => {
  if (newId !== oldId) {
    forceSave()
    loadWhiteboard()
  }
})
</script>

<template>
  <div class="whiteboard-view" :class="{ 'dark': theme === 'dark' }">
    <!-- Loading State -->
    <div v-if="loading" class="whiteboard-loading">
      <div class="loading-spinner"></div>
      <span>載入白板中...</span>
    </div>
    
    <!-- Main Content -->
    <template v-else-if="note">
      <!-- Header -->
      <header class="whiteboard-header">
        <div class="header-left">
          <button class="back-btn" @click="goBack" title="返回">
            <i class="fas fa-arrow-left"></i>
          </button>
          
          <!-- Title -->
          <div class="title-container">
            <input
              v-if="editingTitle"
              ref="titleInput"
              v-model="localTitle"
              class="title-input"
              @blur="saveTitle"
              @keydown="handleTitleKeydown"
            />
            <h1 
              v-else 
              class="title"
              :class="{ editable: canEdit }"
              @click="startEditingTitle"
            >
              <i class="fas fa-chalkboard title-icon"></i>
              {{ localTitle }}
            </h1>
          </div>
        </div>
        
        <div class="header-right">
          <!-- Save Status -->
          <div class="save-status">
            <template v-if="saving">
              <i class="fas fa-spinner fa-spin"></i>
              <span>儲存中...</span>
            </template>
            <template v-else-if="lastSaved">
              <i class="fas fa-check text-success"></i>
              <span>{{ lastSavedText }} 已儲存</span>
            </template>
          </div>
          
          <!-- Read-only Badge -->
          <div v-if="!canEdit" class="readonly-badge">
            <i class="fas fa-eye"></i>
            <span>唯讀模式</span>
          </div>
        </div>
      </header>
      
      <!-- Excalidraw Container -->
      <div class="whiteboard-container">
        <ExcalidrawWrapper
          ref="excalidrawRef"
          :initialData="diagramData"
          :theme="theme"
          :readOnly="!canEdit"
          @change="handleWhiteboardChange"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.whiteboard-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.whiteboard-view.dark {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --text-primary: #d4d4d4;
  --text-secondary: #808080;
  --border-color: #3c3c3c;
}

/* Loading */
.whiteboard-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 1rem;
  color: var(--text-secondary, #666);
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
  to { transform: rotate(360deg); }
}

/* Header */
.whiteboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  color: var(--text-primary, #333);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--bg-primary, #fff);
  border-color: var(--primary, #0066cc);
  color: var(--primary, #0066cc);
}

/* Title */
.title-container {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title.editable {
  cursor: pointer;
}

.title.editable:hover {
  color: var(--primary, #0066cc);
}

.title-icon {
  color: var(--primary, #0066cc);
  font-size: 1rem;
}

.title-input {
  font-size: 1.25rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border: 2px solid var(--primary, #0066cc);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  width: 100%;
  max-width: 400px;
}

/* Save Status */
.save-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary, #666);
}

.save-status .text-success {
  color: var(--success, #28a745);
}

/* Readonly Badge */
.readonly-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: var(--warning-bg, #fff3cd);
  color: var(--warning, #856404);
  border-radius: 6px;
  font-size: 0.85rem;
}

/* Whiteboard Container */
.whiteboard-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Dark mode adjustments */
.dark .whiteboard-header {
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

.dark .back-btn {
  border-color: var(--border-color);
  color: var(--text-primary);
}

.dark .title {
  color: var(--text-primary);
}

.dark .title-input {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--primary);
}

.dark .readonly-badge {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}
</style>
