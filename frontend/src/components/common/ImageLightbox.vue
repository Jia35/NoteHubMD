<script setup>

defineProps({
  image: {
    type: String,
    default: null
  },
  zoom: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['close', 'zoom-in', 'zoom-out', 'wheel'])

const handleWheel = (e) => {
  e.preventDefault()
  emit('wheel', e)
}
</script>

<template>
  <div v-if="image" 
       class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-300"
       @click.self="emit('close')"
       @wheel="handleWheel">
    
    <!-- Controls -->
    <div class="absolute top-4 right-4 flex space-x-2 z-[101]">
      <button @click="emit('zoom-out')" 
              class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
        <i class="fa-solid fa-search-minus"></i>
      </button>
      <button @click="emit('zoom-in')" 
              class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
        <i class="fa-solid fa-search-plus"></i>
      </button>
      <button @click="emit('close')" 
              class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>

    <!-- Image -->
    <img :src="image" 
         class="max-w-none transition-transform duration-200 ease-out origin-center cursor-move"
         :style="{ transform: `scale(${zoom})` }"
         alt="Lightbox Image"
         @click.stop
         draggable="false">
  </div>
</template>
