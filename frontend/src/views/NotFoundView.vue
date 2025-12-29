<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => {
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-dark-bg">
    <div class="text-center">
      <div class="text-9xl font-bold text-gray-300 dark:text-gray-700 mb-4">404</div>
      <h1 class="text-2xl font-bold text-gray-800 dark:text-white mb-2">
        頁面不存在
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mb-8">
        抱歉，您要找的頁面不存在或已被移除。
      </p>
      <button
        @click="goHome"
        class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        <i class="fa-solid fa-home mr-2"></i>
        返回首頁
      </button>
    </div>
  </div>
</template>
