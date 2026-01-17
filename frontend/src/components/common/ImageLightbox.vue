<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  image: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['close'])

const zoom = ref(1)
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3.0
const ZOOM_STEP = 0.25

const zoomIn = () => {
    if (zoom.value < MAX_ZOOM) {
        zoom.value = Math.min(MAX_ZOOM, zoom.value + ZOOM_STEP)
    }
}

const zoomOut = () => {
    if (zoom.value > MIN_ZOOM) {
        zoom.value = Math.max(MIN_ZOOM, zoom.value - ZOOM_STEP)
    }
}

const resetZoom = () => {
    zoom.value = 1
}

const handleWheel = (event) => {
    event.preventDefault()
    if (event.deltaY < 0) {
        zoomIn()
    } else {
        zoomOut()
    }
}

// Drag functionality
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const startX = ref(0)
const startY = ref(0)
const initialTranslateX = ref(0)
const initialTranslateY = ref(0)

const handleMouseDown = (e) => {
  if (zoom.value <= 1) return
  e.preventDefault()
  isDragging.value = true
  startX.value = e.clientX
  startY.value = e.clientY
  initialTranslateX.value = translateX.value
  initialTranslateY.value = translateY.value
}

const handleMouseMove = (e) => {
  if (!isDragging.value) return
  e.preventDefault()
  const dx = e.clientX - startX.value
  const dy = e.clientY - startY.value
  translateX.value = initialTranslateX.value + dx
  translateY.value = initialTranslateY.value + dy
}

const handleMouseUp = () => {
  isDragging.value = false
}

// Reset pan and zoom when image changes or closes
watch(() => props.image, () => {
  zoom.value = 1
  translateX.value = 0
  translateY.value = 0
})

// Reset pan when zoomed out
watch(zoom, (newZoom) => {
  if (newZoom <= 1) {
    translateX.value = 0
    translateY.value = 0
  }
})
</script>

<template>
  <div v-if="image" 
       class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md transition-opacity duration-300"
       @click.self="emit('close')"
       @wheel="handleWheel"
       @mousemove="handleMouseMove"
       @mouseup="handleMouseUp"
       @mouseleave="handleMouseUp">
    
    <!-- Controls -->
    <div class="absolute top-4 right-4 flex items-center space-x-2 z-[101]">
      <!-- Zoom Percentage -->
      <div @click="resetZoom" 
           class="text-white font-medium mr-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full select-none backdrop-blur-sm cursor-pointer transition-colors"
           title="點擊重置縮放">
        {{ Math.round(zoom * 100) }}%
      </div>

      <button @click="zoomIn" 
              class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" title="放大">
        <i class="fa-solid fa-search-plus"></i>
      </button>
      <button @click="zoomOut" 
              class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" title="縮小">
        <i class="fa-solid fa-search-minus"></i>
      </button>
      <button @click="emit('close')" 
              class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" title="關閉">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>

    <!-- Image -->
    <img :src="image" 
         class="max-w-none origin-center select-none"
         :class="[
           zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
           isDragging ? 'transition-none' : 'transition-transform duration-200 ease-out'
         ]"
         :style="{ transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})` }"
         alt="Lightbox Image"
         @click.stop
         @mousedown="handleMouseDown"
         draggable="false">
  </div>
</template>
