<script setup>
/**
 * MaxGraphWrapper - Vue wrapper for maxGraph flowchart editor
 * Provides a complete flowchart editing experience with toolbar and shape palette
 */
import { ref, shallowRef, onMounted, onUnmounted, watch, computed, inject, nextTick } from 'vue'
import { Graph, InternalEvent, RubberBandHandler, ConnectionHandler, 
         Codec, xmlUtils } from '@maxgraph/core'

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({ xml: null, cells: [] })
  },
  theme: {
    type: String,
    default: 'light'
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['change', 'save'])

// Refs
const containerRef = ref(null)
const toolbarRef = ref(null)
const graph = shallowRef(null)
const loading = ref(true)
const error = ref(null)

// Change tracking
let changeTimeout = null
let isInitializing = true

// Available shapes
const shapes = [
  { name: 'rectangle', label: '矩形', icon: 'fa-square', style: 'rounded=0;fillColor=#dae8fc;strokeColor=#6c8ebf;' },
  { name: 'rounded', label: '圓角矩形', icon: 'fa-square', style: 'rounded=1;arcSize=20;fillColor=#d5e8d4;strokeColor=#82b366;' },
  { name: 'ellipse', label: '橢圓', icon: 'fa-circle', style: 'ellipse;fillColor=#ffe6cc;strokeColor=#d79b00;' },
  { name: 'diamond', label: '菱形', icon: 'fa-diamond', style: 'rhombus;fillColor=#fff2cc;strokeColor=#d6b656;' },
  { name: 'parallelogram', label: '平行四邊形', icon: 'fa-vector-square', style: 'shape=parallelogram;perimeter=parallelogramPerimeter;fillColor=#e1d5e7;strokeColor=#9673a6;' },
  { name: 'hexagon', label: '六邊形', icon: 'fa-hexagon-vertical-nesting', style: 'shape=hexagon;perimeter=hexagonPerimeter2;fillColor=#f8cecc;strokeColor=#b85450;' },
  { name: 'cylinder', label: '圓柱', icon: 'fa-database', style: 'shape=cylinder3;whiteSpace=wrap;boundedLbl=1;backgroundOutline=1;size=10;fillColor=#dae8fc;strokeColor=#6c8ebf;' },
  { name: 'triangle', label: '三角形', icon: 'fa-triangle-exclamation', style: 'triangle;fillColor=#f5f5f5;strokeColor=#666666;' }
]

// Selected shape for adding
const selectedShape = ref('rectangle')

// Initialize graph
const initGraph = async () => {
  if (!containerRef.value) {
    console.error('Container not found')
    error.value = '無法初始化編輯器'
    loading.value = false
    return
  }

  try {
    // Create graph instance
    const graphInstance = new Graph(containerRef.value)
    graph.value = graphInstance

    // Configure graph
    graphInstance.setEnabled(!props.readOnly)
    graphInstance.setPanning(true)
    graphInstance.setCellsEditable(true)
    graphInstance.setCellsResizable(true)
    graphInstance.setCellsSelectable(true)
    graphInstance.setConnectable(true)
    graphInstance.setAllowDanglingEdges(false)
    graphInstance.setEdgeLabelsMovable(true)
    graphInstance.setVertexLabelsMovable(true)
    
    // Enable grid
    graphInstance.gridSize = 10
    graphInstance.setGridEnabled(true)

    // Enable rubberband selection
    if (!props.readOnly) {
      new RubberBandHandler(graphInstance)
    }

    // Enable connection handling
    if (!props.readOnly) {
      new ConnectionHandler(graphInstance)
    }

    // Set default edge style
    const edgeStyle = graphInstance.getStylesheet().getDefaultEdgeStyle()
    edgeStyle.edgeStyle = 'orthogonalEdgeStyle'
    edgeStyle.rounded = true
    edgeStyle.jettySize = 'auto'
    edgeStyle.strokeColor = '#666666'
    edgeStyle.strokeWidth = 2
    edgeStyle.endArrow = 'classic'

    // Set default vertex style
    const vertexStyle = graphInstance.getStylesheet().getDefaultVertexStyle()
    vertexStyle.fillColor = '#ffffff'
    vertexStyle.strokeColor = '#000000'
    vertexStyle.fontColor = '#000000'
    vertexStyle.fontSize = 12
    vertexStyle.fontFamily = 'Arial, sans-serif'

    // Apply theme
    applyTheme(props.theme)

    // Load initial data
    if (props.initialData?.xml) {
      loadFromXml(props.initialData.xml)
    }

    // Listen for changes
    graphInstance.getDataModel().addListener(InternalEvent.CHANGE, () => {
      if (!isInitializing) {
        handleChange()
      }
    })

    loading.value = false
    isInitializing = false

  } catch (e) {
    console.error('Failed to initialize maxGraph:', e)
    error.value = e.message || '初始化失敗'
    loading.value = false
  }
}

// Apply theme to graph
const applyTheme = (theme) => {
  if (!graph.value || !containerRef.value) return
  
  if (theme === 'dark') {
    containerRef.value.style.backgroundColor = '#1e1e1e'
    // Update default styles for dark mode
    const vertexStyle = graph.value.getStylesheet().getDefaultVertexStyle()
    vertexStyle.fontColor = '#ffffff'
  } else {
    containerRef.value.style.backgroundColor = '#ffffff'
    const vertexStyle = graph.value.getStylesheet().getDefaultVertexStyle()
    vertexStyle.fontColor = '#000000'
  }
}

// Handle changes
const handleChange = () => {
  if (changeTimeout) {
    clearTimeout(changeTimeout)
  }
  
  changeTimeout = setTimeout(() => {
    const data = getData()
    emit('change', data)
  }, 300)
}

// Get current data
const getData = () => {
  if (!graph.value) return { xml: null, cells: [] }
  
  try {
    const codec = new Codec()
    const encodedModel = codec.encode(graph.value.getDataModel())
    const xml = xmlUtils.getXml(encodedModel)
    
    return { xml }
  } catch (e) {
    console.error('Failed to get graph data:', e)
    return { xml: null }
  }
}

// Load from XML
const loadFromXml = (xml) => {
  if (!graph.value || !xml) return
  
  try {
    const doc = xmlUtils.parseXml(xml)
    const codec = new Codec(doc)
    codec.decode(doc.documentElement, graph.value.getDataModel())
  } catch (e) {
    console.error('Failed to load graph from XML:', e)
  }
}

// Update scene from external data (for sync)
const updateScene = (data) => {
  if (data?.xml) {
    isInitializing = true
    loadFromXml(data.xml)
    isInitializing = false
  }
}

// Add shape to canvas
const addShape = (shapeConfig) => {
  if (!graph.value || props.readOnly) return

  const parent = graph.value.getDefaultParent()
  
  graph.value.batchUpdate(() => {
    // Calculate center position
    const container = containerRef.value
    const x = (container.scrollLeft + container.clientWidth / 2) - 60
    const y = (container.scrollTop + container.clientHeight / 2) - 30
    
    graph.value.insertVertex(
      parent,
      null,
      '文字',
      x,
      y,
      120,
      60,
      shapeConfig.style
    )
  })
}

// Toolbar actions
const zoomIn = () => {
  if (graph.value) {
    graph.value.zoomIn()
  }
}

const zoomOut = () => {
  if (graph.value) {
    graph.value.zoomOut()
  }
}

const zoomReset = () => {
  if (graph.value) {
    graph.value.zoomActual()
  }
}

const fitToContent = () => {
  if (graph.value) {
    graph.value.fit()
  }
}

const undo = () => {
  // Note: maxGraph needs UndoManager for proper undo/redo
  // This is a simplified version
  if (graph.value) {
    graph.value.getDataModel().clear()
  }
}

const deleteSelected = () => {
  if (graph.value && !props.readOnly) {
    const cells = graph.value.getSelectionCells()
    if (cells.length > 0) {
      graph.value.removeCells(cells)
    }
  }
}

const clearAll = () => {
  if (graph.value && !props.readOnly) {
    graph.value.getDataModel().clear()
    handleChange()
  }
}

// Export functions
const exportAsSvg = () => {
  if (!graph.value) return null
  
  // Get SVG representation
  const svgDoc = graph.value.container.querySelector('svg')
  if (svgDoc) {
    return new XMLSerializer().serializeToString(svgDoc)
  }
  return null
}

// Watch for theme changes
watch(() => props.theme, (newTheme) => {
  applyTheme(newTheme)
})

// Watch for readOnly changes
watch(() => props.readOnly, (newReadOnly) => {
  if (graph.value) {
    graph.value.setEnabled(!newReadOnly)
  }
})

// Lifecycle
onMounted(() => {
  nextTick(() => {
    initGraph()
  })
})

onUnmounted(() => {
  if (changeTimeout) {
    clearTimeout(changeTimeout)
  }
  if (graph.value) {
    graph.value.destroy()
  }
})

// Expose methods
defineExpose({
  getData,
  updateScene,
  exportAsSvg,
  zoomIn,
  zoomOut,
  zoomReset,
  fitToContent,
  clearAll
})
</script>

<template>
  <div class="maxgraph-wrapper">
    <!-- Loading Overlay -->
    <div v-if="loading" class="maxgraph-loading-overlay">
      <div class="loading-spinner"></div>
      <span>載入流程圖編輯器中...</span>
    </div>
    
    <!-- Error State -->
    <div v-if="error" class="maxgraph-error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>無法載入編輯器：{{ error }}</span>
    </div>
    
    <!-- Editor -->
    <div class="maxgraph-editor" v-show="!error">
      <!-- Toolbar -->
      <div v-if="!readOnly" class="maxgraph-toolbar" ref="toolbarRef">
        <!-- Shape Palette -->
        <div class="toolbar-section shapes-section">
          <span class="section-label">形狀</span>
          <div class="shape-buttons">
            <button 
              v-for="shape in shapes" 
              :key="shape.name"
              @click="addShape(shape)"
              class="shape-btn"
              :title="shape.label"
            >
              <i :class="['fas', shape.icon]"></i>
            </button>
          </div>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <!-- Tools -->
        <div class="toolbar-section">
          <button @click="zoomIn" class="tool-btn" title="放大">
            <i class="fas fa-search-plus"></i>
          </button>
          <button @click="zoomOut" class="tool-btn" title="縮小">
            <i class="fas fa-search-minus"></i>
          </button>
          <button @click="zoomReset" class="tool-btn" title="重設縮放">
            <i class="fas fa-expand"></i>
          </button>
          <button @click="fitToContent" class="tool-btn" title="適應內容">
            <i class="fas fa-compress-arrows-alt"></i>
          </button>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <!-- Actions -->
        <div class="toolbar-section">
          <button @click="deleteSelected" class="tool-btn" title="刪除選取">
            <i class="fas fa-trash"></i>
          </button>
          <button @click="clearAll" class="tool-btn tool-btn-danger" title="清除全部">
            <i class="fas fa-times-circle"></i>
          </button>
        </div>
      </div>
      
      <!-- Graph Container -->
      <div ref="containerRef" class="maxgraph-container" :class="{ 'read-only': readOnly }"></div>
    </div>
  </div>
</template>

<style scoped>
.maxgraph-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.maxgraph-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 10;
  color: var(--text-secondary, #666);
}

.dark .maxgraph-loading-overlay {
  background: rgba(30, 30, 30, 0.8);
  color: #bbb;
}

.maxgraph-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.maxgraph-error {
  color: var(--danger, #dc3545);
}

.maxgraph-error i {
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

/* Toolbar */
.maxgraph-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-secondary, #f5f5f5);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  flex-wrap: wrap;
}

.dark .maxgraph-toolbar {
  background: #2d2d2d;
  border-color: #444;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.section-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #666);
  margin-right: 0.5rem;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color, #ddd);
  margin: 0 0.5rem;
}

.dark .toolbar-divider {
  background: #555;
}

.shape-buttons {
  display: flex;
  gap: 0.25rem;
}

.shape-btn,
.tool-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  background: white;
  color: var(--text-primary, #333);
  cursor: pointer;
  transition: all 0.2s;
}

.dark .shape-btn,
.dark .tool-btn {
  background: #3d3d3d;
  border-color: #555;
  color: #ddd;
}

.shape-btn:hover,
.tool-btn:hover {
  background: var(--primary, #0066cc);
  color: white;
  border-color: var(--primary, #0066cc);
}

.tool-btn-danger:hover {
  background: var(--danger, #dc3545);
  border-color: var(--danger, #dc3545);
}

/* Graph Container */
.maxgraph-container {
  flex: 1;
  overflow: auto;
  background: #ffffff;
  position: relative;
}

.dark .maxgraph-container {
  background: #1e1e1e;
}

.maxgraph-container.read-only {
  cursor: default;
}

/* maxGraph internal styles */
.maxgraph-container :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
