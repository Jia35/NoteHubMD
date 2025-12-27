<script setup>
/**
 * AboutModal - 關於 NoteHubMD Modal
 */
defineProps({
  show: Boolean,
  appVersion: { type: String, default: '' }
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <!-- Header -->
        <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center">
            <i class="fa-solid fa-circle-info mr-2 text-blue-500"></i> 關於 NoteHubMD
          </h2>
          <button @click="emit('close')"
                  class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <!-- Body -->
        <div class="p-6 text-center">
          <img src="@/assets/images/logo.png" alt="NoteHubMD"
               class="w-20 h-20 mx-auto mb-4 cursor-pointer hover:animate-bounce transition-transform">
          <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-1">NoteHubMD</h3>
          <p class="text-xs text-gray-400 mb-3">v{{ appVersion }}</p>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-10">
            現代化、可自架的 Markdown 筆記平台，支援即時協作。
          </p>
          <hr class="border-gray-200 dark:border-gray-700 mb-6">
          <div class="text-left text-gray-600 dark:text-gray-400">
            <h4 class="text-sm font-bold mb-2">
              ❄️ 雪之妖精——「北長尾山雀」
            </h4>
            <p class="text-sm leading-relaxed mb-3">
              外型像一顆長尾巴的棉花糖，圓滾滾又呆萌，卻是觀察力滿點的小鳥。牠們行動安靜、習慣群聚，總在枝頭默默記錄季節的變化。
            </p>
            <p class="text-sm leading-relaxed">
              靈感就像牠們一樣，靈動可愛卻又稍縱即逝，不趕快記下來就會咻——地飛走，快把它們「抓」進筆記裡吧！
            </p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
