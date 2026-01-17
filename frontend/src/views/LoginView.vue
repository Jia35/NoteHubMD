<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/composables/useApi'

const router = useRouter()
const route = useRoute()

const isLoginMode = ref(true)
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)
const usernameInput = ref(null)
const ldapEnabled = ref(false)
const configLoaded = ref(false)

// Load auth config to check if LDAP is enabled
const loadAuthConfig = async () => {
  try {
    const response = await fetch('/api/auth/config')
    if (response.ok) {
      const config = await response.json()
      ldapEnabled.value = config.ldapEnabled || false
    }
  } catch (e) {
    console.error('Failed to load auth config:', e)
  }
  configLoaded.value = true
}

onMounted(() => {
  loadAuthConfig()
  nextTick(() => {
    usernameInput.value?.focus()
  })
})

const toggleMode = () => {
  if (ldapEnabled.value) return // Don't allow toggle in LDAP mode
  isLoginMode.value = !isLoginMode.value
  error.value = ''
  nextTick(() => {
    usernameInput.value?.focus()
  })
}

const handleSubmit = async () => {
  error.value = ''
  
  if (!username.value || !password.value) {
    error.value = '請輸入帳號和密碼'
    return
  }
  
  if (!isLoginMode.value && password.value !== confirmPassword.value) {
    error.value = '密碼不一致'
    return
  }
  
  loading.value = true
  
  try {
    if (isLoginMode.value) {
      await api.login(username.value, password.value)
    } else {
      await api.register(username.value, password.value)
    }
    
    // Redirect to original page if available, otherwise home
    const redirect = route.query.redirect || '/'
    window.location.href = redirect
  } catch (e) {
    error.value = e.message || '操作失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-dark-bg">
    <div class="w-full max-w-md mx-4">
      <!-- Logo -->
      <div class="text-center mb-6">
        <img src="@/assets/images/logo.png" alt="NoteHubMD" class="w-12 h-12 mx-auto mb-2" />
        <h1 class="text-2xl font-bold text-gray-800 dark:text-white">NoteHubMD</h1>
      </div>

      <!-- Login/Register Card -->
      <div class="bg-white dark:bg-dark-surface p-8 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
        <h2 class="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white">
          {{ ldapEnabled ? 'AD 登入' : (isLoginMode ? '登入' : '註冊') }}
        </h2>

        <form @submit.prevent="handleSubmit">
          <!-- Username -->
          <div class="mb-4">
            <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
              {{ ldapEnabled ? 'AD 帳號' : '帳號' }}
            </label>
            <input
              ref="usernameInput"
              v-model="username"
              type="text"
              class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
              :placeholder="ldapEnabled ? '輸入 AD 帳號' : '輸入帳號'"
              autocomplete="username"
              required
            />
          </div>

          <!-- Password -->
          <div class="mb-4">
            <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
              {{ ldapEnabled ? 'AD 密碼' : '密碼' }}
            </label>
            <input
              v-model="password"
              type="password"
              class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
              :placeholder="ldapEnabled ? '輸入 AD 密碼' : '輸入密碼'"
              autocomplete="current-password"
              required
            />
          </div>

          <!-- Confirm Password (Register only, non-LDAP) -->
          <div v-if="!isLoginMode && !ldapEnabled" class="mb-4">
            <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
              確認密碼
            </label>
            <input
              v-model="confirmPassword"
              type="password"
              class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
              placeholder="再次輸入密碼"
              autocomplete="new-password"
              required
            />
          </div>

          <!-- Error Message -->
          <div v-if="error" class="mb-4 text-red-500 text-sm text-center">
            {{ error }}
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <i v-if="loading" class="fa-solid fa-spinner fa-spin mr-2"></i>
            {{ ldapEnabled ? '登入' : (isLoginMode ? '登入' : '註冊') }}
          </button>
        </form>

        <!-- Toggle Mode (Hide in LDAP mode) -->
        <div v-if="!ldapEnabled" class="mt-4 text-center">
          <button
            @click="toggleMode"
            class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm cursor-pointer"
          >
            {{ isLoginMode ? '還沒有帳號？ 點此註冊' : '已經有帳號？ 點此登入' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
