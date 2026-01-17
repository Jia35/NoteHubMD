<script setup>
/**
 * DrawioEmbedWrapper - Vue wrapper for Draw.io embedded editor
 * Uses iframe + postMessage protocol to communicate with Draw.io
 * Reference: https://www.drawio.com/doc/faq/embed-mode
 */
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({ xml: null })
  },
  theme: {
    type: String,
    default: 'kennedy' // 'kennedy', 'dark', 'atlas', 'min', 'sketch'
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['change', 'save', 'ready'])

// Refs
const iframeRef = ref(null)
const loading = ref(true)
const error = ref(null)
const isReady = ref(false)
let pendingXml = null

// Draw.io base URL (fetched from backend API)
const baseDrawioUrl = ref('')

// Fetch Draw.io URL from backend config
const fetchDrawioUrl = async () => {
  try {
    const res = await fetch('/api/config/features')
    if (res.ok) {
      const config = await res.json()
      if (config.drawioUrl) {
        baseDrawioUrl.value = config.drawioUrl
      } else {
        baseDrawioUrl.value = 'https://embed.diagrams.net'
      }
    } else {
      baseDrawioUrl.value = 'https://embed.diagrams.net'
    }
  } catch (e) {
    console.warn('Failed to fetch Draw.io URL config, using default:', e)
    baseDrawioUrl.value = 'https://embed.diagrams.net'
  }
}

// Draw.io URL configuration
const drawioUrl = computed(() => {
  if (!baseDrawioUrl.value) return ''

  const params = new URLSearchParams({
    embed: '1',
    proto: 'json',
    spin: '1',
    ui: props.theme,
    dark: props.theme === 'dark' ? '1' : '0',
    saveAndExit: '0',
    noSaveBtn: props.readOnly ? '1' : '0',
    noExitBtn: '1',
    modified: 'unsavedChanges',
    // Read-only mode: disable editing UI
    ...(props.readOnly && {
      chrome: '0',        // Disable menus/toolbars
      toolbar: '0',       // Disable toolbar
      edit: '_blank'      // Disable inline editing
    })
  })
  return `${baseDrawioUrl.value}/?${params.toString()}`
})

// Handle messages from Draw.io
const handleMessage = (event) => {
  // Draw.io can send messages from various origins
  // In embed mode, we trust messages with the correct JSON format
  // For security in production, you can restrict this further
  
  let msg
  try {
    msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
  } catch (e) {
    return
  }

  if (!msg || !msg.event) return

  switch (msg.event) {
    case 'init':
      // Draw.io is ready, load initial data
      console.log('Draw.io initialized')
      isReady.value = true
      loading.value = false
      emit('ready')
      
      // Load pending or initial XML - MUST send load to dismiss Draw.io loading
      const xmlToLoad = pendingXml || props.initialData?.xml
      if (xmlToLoad) {
        loadXml(xmlToLoad)
      } else {
        // Send empty diagram to complete initialization
        sendAction('load', { xml: '', autosave: 1 })
      }
      break

    case 'save':
      // User clicked save or auto-save triggered
      const savedXml = msg.xml
      emit('save', { xml: savedXml })
      emit('change', { xml: savedXml })
      
      // Acknowledge save
      sendAction('status', { message: '已儲存', modified: false })
      break

    case 'autosave':
      // Auto-save event
      emit('change', { xml: msg.xml })
      break

    case 'exit':
      // User tried to exit (we disabled exit button, but handle anyway)
      break

    case 'export':
      // Export completed
      if (msg.format === 'svg' || msg.format === 'png') {
        // Handle export data
        console.log('Export completed:', msg.format)
      }
      break

    case 'template':
    case 'template-callback':
      // Template loaded or selected
      break

    default:
      console.log('Draw.io event:', msg.event, msg)
  }
}

// Send action to Draw.io
const sendAction = (action, data = {}) => {
  if (!iframeRef.value?.contentWindow) return
  
  const message = JSON.stringify({ action, ...data })
  iframeRef.value.contentWindow.postMessage(message, '*')
}

// Load XML into editor
const loadXml = (xml) => {
  if (!isReady.value) {
    pendingXml = xml
    return
  }
  
  if (xml) {
    sendAction('load', { xml, autosave: 1 })
  }
}

// Get current data (request export)
const getData = () => {
  return new Promise((resolve) => {
    const handler = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (msg?.event === 'export' && msg.format === 'xml') {
          window.removeEventListener('message', handler)
          resolve({ xml: msg.xml })
        }
      } catch (e) {
        // Ignore
      }
    }
    
    window.addEventListener('message', handler)
    sendAction('export', { format: 'xml' })
    
    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({ xml: null })
    }, 5000)
  })
}

// Export as SVG
const exportAsSvg = () => {
  return new Promise((resolve) => {
    const handler = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (msg?.event === 'export' && msg.format === 'svg') {
          window.removeEventListener('message', handler)
          resolve(msg.data)
        }
      } catch (e) {
        // Ignore
      }
    }
    
    window.addEventListener('message', handler)
    sendAction('export', { format: 'svg' })
    
    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(null)
    }, 5000)
  })
}

// Export as PNG
const exportAsPng = () => {
  return new Promise((resolve) => {
    const handler = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (msg?.event === 'export' && msg.format === 'png') {
          window.removeEventListener('message', handler)
          resolve(msg.data)
        }
      } catch (e) {
        // Ignore
      }
    }
    
    window.addEventListener('message', handler)
    sendAction('export', { format: 'png', scale: 2 })
    
    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve(null)
    }, 5000)
  })
}

// Update scene from external data (for sync)
const updateScene = (data) => {
  if (data?.xml) {
    loadXml(data.xml)
  }
}

// Watch for theme changes
watch(() => props.theme, async () => {
  // Theme requires reload of iframe - save current data first
  if (iframeRef.value && isReady.value) {
    try {
      // Get current diagram data before reload
      const currentData = await getData()
      if (currentData?.xml) {
        pendingXml = currentData.xml
      }
    } catch (e) {
      console.warn('Could not save data before theme change:', e)
    }
    
    // Reload iframe with new theme
    if (drawioUrl.value) {
      iframeRef.value.src = drawioUrl.value
      loading.value = true
      isReady.value = false
    }
  }
})

// Watch for readOnly changes
watch(() => props.readOnly, () => {
  // ReadOnly requires reload
  if (iframeRef.value && drawioUrl.value) {
    iframeRef.value.src = drawioUrl.value
    loading.value = true
    isReady.value = false
  }
})

// Mark document as saved (to prevent beforeunload warning)
const markAsSaved = () => {
  sendAction('status', { message: '', modified: false })
}

// Lifecycle
onMounted(() => {
  fetchDrawioUrl()
  window.addEventListener('message', handleMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})

// Expose methods
defineExpose({
  getData,
  updateScene,
  exportAsSvg,
  exportAsPng,
  loadXml,
  markAsSaved
})
</script>

<template>
  <div class="drawio-wrapper">
    <!-- Loading Overlay -->
    <div v-if="loading" class="drawio-loading">
      <div class="loading-spinner"></div>
      <span>載入 Draw.io 編輯器中...</span>
    </div>
    
    <!-- Error State -->
    <div v-if="error" class="drawio-error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>無法載入編輯器：{{ error }}</span>
    </div>
    
    <!-- Draw.io iframe -->
    <iframe
      v-if="drawioUrl"
      ref="iframeRef"
      :src="drawioUrl"
      class="drawio-iframe"
      frameborder="0"
      allow="clipboard-read; clipboard-write"
    ></iframe>
  </div>
</template>

<style scoped>
.drawio-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
}

.dark .drawio-wrapper {
  background: #1e1e1e;
}

.drawio-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 10;
  color: #666;
  pointer-events: none;
}

.dark .drawio-loading {
  background: rgba(30, 30, 30, 0.9);
  color: #bbb;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #0066cc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.drawio-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: #dc3545;
  text-align: center;
}

.drawio-error i {
  font-size: 2rem;
}

.drawio-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
