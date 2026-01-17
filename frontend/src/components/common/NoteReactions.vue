<template>
  <div v-if="featureEnabled" class="note-reactions flex flex-col items-center py-3">
    <p class="text-base text-gray-400 dark:text-gray-500 mb-2">給筆記一個表情回饋</p>
    <div class="flex items-center gap-2">
      <div 
        v-for="reaction in reactionTypes" 
        :key="reaction.type"
        class="relative group"
      >
        <button 
          @click="toggleReaction(reaction.type)"
          class="reaction-btn flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer"
          :class="[
            userReaction === reaction.type 
              ? `${reaction.selectedBg} ${reaction.selectedBorder} border` 
              : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-transparent'
          ]"
        >
          <i :class="[reaction.icon, reaction.color]"></i>
          <span 
            class="min-w-[1rem] text-center"
            :class="userReaction === reaction.type ? reaction.color : 'text-gray-600 dark:text-gray-300'"
          >{{ reactionCounts[reaction.type] || 0 }}</span>
        </button>
        <!-- Tooltip -->
        <div 
          v-if="reactionUsers[reaction.type]?.length > 0"
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50"
        >
          <div class="text-center">
            {{ getTooltipText(reaction.type) }}
          </div>
          <!-- Arrow -->
          <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-700"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import api from '@/composables/useApi'

const props = defineProps({
  noteId: {
    type: String,
    required: true
  },
  currentUser: {
    type: Object,
    default: null
  }
})

const showAlert = inject('showAlert', null)

// Reaction types (same as comment reactions)
const reactionTypes = [
  { type: 'like', icon: 'fa-solid fa-thumbs-up', color: 'text-blue-500', label: '讚', selectedBg: 'bg-blue-100 dark:bg-blue-900', selectedBorder: 'border-blue-300 dark:border-blue-700' },
  { type: 'ok', icon: 'fa-solid fa-circle-check', color: 'text-green-500', label: 'OK', selectedBg: 'bg-green-100 dark:bg-green-900', selectedBorder: 'border-green-300 dark:border-green-700' },
  { type: 'laugh', icon: 'fa-solid fa-face-laugh-squint', color: 'text-yellow-500', label: '哈哈', selectedBg: 'bg-yellow-100 dark:bg-yellow-900', selectedBorder: 'border-yellow-300 dark:border-yellow-700' },
  { type: 'surprise', icon: 'fa-solid fa-face-surprise', color: 'text-amber-500', label: '驚訝', selectedBg: 'bg-amber-100 dark:bg-amber-900', selectedBorder: 'border-amber-300 dark:border-amber-700' },
  { type: 'sad', icon: 'fa-solid fa-face-sad-tear', color: 'text-sky-500', label: '難過', selectedBg: 'bg-sky-100 dark:bg-sky-900', selectedBorder: 'border-sky-300 dark:border-sky-700' }
]

// State
const featureEnabled = ref(true)
const reactionCounts = ref({})
const reactionUsers = ref({})
const userReaction = ref(null)

// Get tooltip text for a reaction type
const getTooltipText = (type) => {
  const users = reactionUsers.value[type] || []
  if (users.length === 0) return ''
  
  const maxShow = 5
  const names = users.slice(0, maxShow).map(u => u.name || u.username)
  
  if (users.length > maxShow) {
    return names.join('、') + ` 等 ${users.length} 人`
  }
  return names.join('、')
}

// Load reactions
const loadReactions = async () => {
  try {
    const data = await api.getNoteReactions(props.noteId)
    reactionCounts.value = data.reactionCounts || {}
    reactionUsers.value = data.reactionUsers || {}
    userReaction.value = data.userReaction || null
  } catch (e) {
    // Feature might be disabled
    featureEnabled.value = false
  }
}

// Toggle reaction
const toggleReaction = async (type) => {
  if (!props.currentUser) {
    showAlert?.('請先登入才能使用表情回饋功能', 'warning')
    return
  }

  try {
    const result = await api.toggleNoteReaction(props.noteId, type)

    if (result.action === 'added') {
      // If had previous reaction, remove user from old type
      if (userReaction.value && userReaction.value !== type) {
        reactionCounts.value[userReaction.value] = (reactionCounts.value[userReaction.value] || 1) - 1
        if (reactionCounts.value[userReaction.value] <= 0) {
          delete reactionCounts.value[userReaction.value]
        }
        // Remove from users list
        if (reactionUsers.value[userReaction.value]) {
          reactionUsers.value[userReaction.value] = reactionUsers.value[userReaction.value].filter(u => u.id !== props.currentUser.id)
        }
      }
      // Increment new reaction count and add user
      reactionCounts.value[type] = (reactionCounts.value[type] || 0) + 1
      if (!reactionUsers.value[type]) {
        reactionUsers.value[type] = []
      }
      reactionUsers.value[type].push({
        id: props.currentUser.id,
        username: props.currentUser.username,
        name: props.currentUser.name || props.currentUser.username
      })
      userReaction.value = type
    } else if (result.action === 'removed') {
      // Decrement count and remove user
      reactionCounts.value[type] = (reactionCounts.value[type] || 1) - 1
      if (reactionCounts.value[type] <= 0) {
        delete reactionCounts.value[type]
      }
      if (reactionUsers.value[type]) {
        reactionUsers.value[type] = reactionUsers.value[type].filter(u => u.id !== props.currentUser.id)
      }
      userReaction.value = null
    }
  } catch (e) {
    showAlert?.('操作失敗', 'error')
  }
}

// Check feature status and load reactions
onMounted(async () => {
  try {
    const config = await api.getFeatureConfig()
    featureEnabled.value = config.noteReactions !== false
    if (featureEnabled.value) {
      await loadReactions()
    }
  } catch (e) {
    featureEnabled.value = false
  }
})
</script>

<style scoped>
.reaction-btn:hover {
  transform: scale(1.05);
}

.reaction-btn:active {
  transform: scale(0.95);
}
</style>

