<script setup>
/**
 * ExcalidrawWrapper - Vue wrapper for Excalidraw React component
 * Uses Veaury to bridge React component into Vue 3
 */
import { ref, shallowRef, markRaw, watch, onMounted, onUnmounted, computed } from 'vue'
import { applyPureReactInVue } from 'veaury'
// Import Excalidraw CSS - required for proper styling
import '@excalidraw/excalidraw/index.css'

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({ elements: [], appState: {}, files: {} })
  },
  theme: {
    type: String,
    default: 'light'
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  langCode: {
    type: String,
    default: 'zh-TW'
  }
})

const emit = defineEmits(['change', 'save'])

// Excalidraw component (loaded dynamically) - use shallowRef to avoid reactivity
const ExcalidrawComponent = shallowRef(null)
const loading = ref(true)
const error = ref(null)
const excalidrawAPI = shallowRef(null)

// Internal state for tracking changes
let lastSavedData = null
let changeTimeout = null

// Load Excalidraw dynamically
onMounted(async () => {
  try {
    const excalidrawModule = await import('@excalidraw/excalidraw')
    // Use markRaw to prevent Vue from making the React component reactive
    ExcalidrawComponent.value = markRaw(applyPureReactInVue(excalidrawModule.Excalidraw))
    loading.value = false
  } catch (e) {
    console.error('Failed to load Excalidraw:', e)
    error.value = e.message
    loading.value = false
  }
})

onUnmounted(() => {
  if (changeTimeout) {
    clearTimeout(changeTimeout)
  }
})

// Handle Excalidraw changes
const handleChange = (elements, appState, files) => {
  // Debounce changes to avoid too many events
  if (changeTimeout) {
    clearTimeout(changeTimeout)
  }
  
  changeTimeout = setTimeout(() => {
    const data = {
      elements: elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize
      },
      files: files || {}
    }
    
    emit('change', data)
  }, 300)
}

// Get the Excalidraw API ref
const handleExcalidrawAPI = (api) => {
  excalidrawAPI.value = api
}

// Computed props for Excalidraw
const excalidrawProps = computed(() => ({
  initialData: props.initialData,
  theme: props.theme,
  viewModeEnabled: props.readOnly,
  langCode: props.langCode,
  onChange: handleChange,
  excalidrawAPI: handleExcalidrawAPI,
  UIOptions: {
    canvasActions: {
      changeViewBackgroundColor: true,
      clearCanvas: !props.readOnly,
      export: { saveFileToDisk: true },
      loadScene: !props.readOnly,
      saveToActiveFile: false,
      toggleTheme: true,
    }
  }
}))

// Expose methods for parent component
defineExpose({
  getAPI: () => excalidrawAPI.value,
  getElements: () => excalidrawAPI.value?.getSceneElements() || [],
  getAppState: () => excalidrawAPI.value?.getAppState() || {},
  getFiles: () => excalidrawAPI.value?.getFiles() || {},
  
  // Get current scene data (for export/sync)
  getData: () => ({
    elements: excalidrawAPI.value?.getSceneElements() || [],
    appState: excalidrawAPI.value?.getAppState() || {},
    files: excalidrawAPI.value?.getFiles() || {}
  }),
  
  // Update scene from remote sync (Yjs collaboration)
  updateScene: (data) => {
    if (excalidrawAPI.value) {
      excalidrawAPI.value.updateScene({
        elements: data.elements || [],
        appState: data.appState
      })
    }
  }
})
</script>

<template>
  <div class="excalidraw-wrapper">
    <!-- Loading State -->
    <div v-if="loading" class="excalidraw-loading">
      <div class="loading-spinner"></div>
      <span>載入白板編輯器中...</span>
    </div>
    
    <!-- Error State -->
    <div v-else-if="error" class="excalidraw-error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>無法載入白板編輯器：{{ error }}</span>
    </div>
    
    <!-- Excalidraw Component -->
    <component
      v-else-if="ExcalidrawComponent"
      :is="ExcalidrawComponent"
      v-bind="excalidrawProps"
    />
  </div>
</template>

<style scoped>
.excalidraw-wrapper {
  width: 100%;
  height: 100%;
  min-height: 500px;
  position: relative;
}

.excalidraw-loading,
.excalidraw-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
  gap: 1rem;
  color: var(--text-secondary, #666);
}

.excalidraw-error {
  color: var(--danger, #dc3545);
}

.excalidraw-error i {
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

/* Excalidraw container styling */
.excalidraw-wrapper :deep(.excalidraw) {
  width: 100%;
  height: 100%;
}

.excalidraw-wrapper :deep(.excalidraw-container) {
  width: 100%;
  height: 100%;
}
</style>
