<script setup>
/**
 * UserProfileModal - 使用者資料編輯 Modal
 */
import { ref, watch, nextTick } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import api from '@/composables/useApi'

const props = defineProps({
  show: Boolean,
  user: { type: Object, default: null }
})

const emit = defineEmits(['close', 'save', 'updated'])

// State
const editableName = ref('')
const avatarPreview = ref('')
const savingProfile = ref(false)
const avatarFile = ref(null)
const avatarRemoved = ref(false)

// Cropper state
const showCropperModal = ref(false)
const cropperImageSrc = ref('')
const cropperImageRef = ref(null)
let cropperInstance = null
let pendingAvatarFile = null

// Watch for show changes
watch(() => props.show, (newVal) => {
  if (newVal && props.user) {
    editableName.value = props.user.name || ''
    avatarPreview.value = props.user.avatar || ''
    avatarFile.value = null
    avatarRemoved.value = false
  }
})

// Handle avatar file change
const handleAvatarChange = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  pendingAvatarFile = file
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    showCropperModal.value = true
    
    // Initialize cropper after modal opens
    setTimeout(() => {
      if (cropperImageRef.value) {
        cropperInstance = new Cropper(cropperImageRef.value, {
          aspectRatio: 1,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.9,
          cropBoxMovable: true,
          cropBoxResizable: true,
          background: false
        })
      }
    }, 100)
  }
  reader.readAsDataURL(file)
  event.target.value = '' // Reset input
}

// Close cropper modal
const closeCropperModal = () => {
  showCropperModal.value = false
  if (cropperInstance) {
    cropperInstance.destroy()
    cropperInstance = null
  }
  cropperImageSrc.value = ''
  pendingAvatarFile = null
}

// Rotate cropper
const rotateCropper = (degree) => {
  if (cropperInstance) {
    cropperInstance.rotate(degree)
  }
}

// Apply crop
const applyCrop = async () => {
  if (!cropperInstance) return
  
  try {
    const cropData = cropperInstance.getData()
    const canvas = cropperInstance.getCroppedCanvas({
      width: 256,
      height: 256,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    })
    
    // Convert canvas to blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    
    // Store for save operation
    avatarFile.value = {
      cropped: croppedFile,
      original: pendingAvatarFile,
      cropData: cropData
    }
    avatarRemoved.value = false
    
    // Update preview
    avatarPreview.value = canvas.toDataURL('image/jpeg', 0.9)
    
    closeCropperModal()
  } catch (e) {
    console.error('Crop failed:', e)
  }
}

// Open re-crop modal
const openReCropModal = () => {
  let imageSrc = null
  if (avatarFile.value?.original) {
    const reader = new FileReader()
    reader.onload = (e) => {
      cropperImageSrc.value = e.target.result
      showCropperModal.value = true
      initCropperWithDelay()
    }
    reader.readAsDataURL(avatarFile.value.original)
    return
  } else if (props.user?.avatarOriginal) {
    imageSrc = props.user.avatarOriginal
  } else if (avatarPreview.value) {
    imageSrc = avatarPreview.value
  }
  
  if (!imageSrc) return
  
  cropperImageSrc.value = imageSrc
  showCropperModal.value = true
  initCropperWithDelay()
}

// Helper to init cropper after delay
const initCropperWithDelay = () => {
  setTimeout(() => {
    if (cropperImageRef.value) {
      cropperInstance = new Cropper(cropperImageRef.value, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        cropBoxMovable: true,
        cropBoxResizable: true,
        background: false
      })
    }
  }, 100)
}

// Remove avatar
const removeAvatar = () => {
  avatarPreview.value = ''
  avatarFile.value = null
  avatarRemoved.value = true
}

// Save profile
const saveProfile = async () => {
  savingProfile.value = true
  try {
    let avatarUrl = props.user?.avatar
    let avatarOriginalUrl = props.user?.avatarOriginal
    
    if (avatarRemoved.value) {
      avatarUrl = null
      avatarOriginalUrl = null
    } else if (avatarFile.value) {
      // Upload cropped avatar
      if (avatarFile.value.cropped) {
        const croppedResult = await api.uploadAvatar(avatarFile.value.cropped)
        avatarUrl = croppedResult.url
        
        // Upload original if available
        if (avatarFile.value.original) {
          const originalResult = await api.uploadAvatar(avatarFile.value.original)
          avatarOriginalUrl = originalResult.url
        }
      }
    }
    
    await api.updateProfile({
      name: editableName.value,
      avatar: avatarUrl,
      avatarOriginal: avatarOriginalUrl
    })
    
    emit('updated', {
      name: editableName.value,
      avatar: avatarUrl,
      avatarOriginal: avatarOriginalUrl
    })
    
    avatarFile.value = null
    avatarRemoved.value = false
    pendingAvatarFile = null
    emit('close')
  } catch (e) {
    console.error('Save profile failed:', e)
  } finally {
    savingProfile.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-96 text-gray-900 dark:text-gray-100">
        <h2 class="text-xl font-bold mb-4"><i class="fa-solid fa-user mr-2"></i>個人資料</h2>

        <!-- Avatar Section -->
        <div class="flex flex-col items-center mb-6">
          <label class="cursor-pointer group">
            <div class="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-3 relative"
                 :class="user ? 'bg-blue-600' : 'bg-gray-500'">
              <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover" alt="Avatar">
              <span v-else class="text-3xl text-white">{{ user?.username?.charAt(0).toUpperCase() || '?' }}</span>
              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                <i class="fa-solid fa-camera text-white text-xl"></i>
              </div>
            </div>
            <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange">
          </label>
          <div class="flex gap-3">
            <label class="cursor-pointer text-blue-600 hover:text-blue-700 text-sm">
              <i class="fa-solid fa-camera mr-1"></i>變更頭像
              <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange">
            </label>
            <button v-if="avatarPreview && !avatarRemoved" @click="openReCropModal"
                    class="text-purple-500 hover:text-purple-600 text-sm cursor-pointer">
              <i class="fa-solid fa-crop mr-1"></i>重新裁切
            </button>
            <button v-if="avatarPreview" @click="removeAvatar"
                    class="text-red-500 hover:text-red-600 text-sm cursor-pointer">
              <i class="fa-solid fa-trash mr-1"></i>移除頭像
            </button>
          </div>
        </div>

        <!-- Avatar Cropper Modal -->
        <div v-if="showCropperModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
          <div class="bg-white dark:bg-dark-surface p-6 rounded-lg shadow-xl w-full max-w-lg mx-4 text-gray-900 dark:text-gray-100">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold"><i class="fa-solid fa-crop mr-2"></i>裁切頭像</h2>
              <button @click="closeCropperModal"
                      class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
                <i class="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>

            <!-- Cropper Container -->
            <div class="relative w-full h-80 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-4">
              <img ref="cropperImageRef" :src="cropperImageSrc" class="max-w-full" style="display: block; max-width: 100%;">
            </div>

            <!-- Cropper Actions -->
            <div class="flex justify-between items-center">
              <div class="flex gap-2">
                <button @click="rotateCropper(-90)"
                        class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                        title="向左旋轉">
                  <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button @click="rotateCropper(90)"
                        class="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                        title="向右旋轉">
                  <i class="fa-solid fa-rotate-right"></i>
                </button>
              </div>
              <div class="flex gap-2">
                <button @click="closeCropperModal"
                        class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
                  取消
                </button>
                <button @click="applyCrop"
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition cursor-pointer">
                  <i class="fa-solid fa-check mr-1"></i>確定裁切
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Username (read-only) -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">帳號 (Username)</label>
          <div class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 text-sm">
            {{ user?.username }}
          </div>
        </div>

        <!-- Name (editable) -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">顯示名稱 (Name)</label>
          <input v-model="editableName" type="text" placeholder="輸入顯示名稱..."
                 class="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2">
          <button @click="emit('close')"
                  class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">
            取消
          </button>
          <button @click="saveProfile" :disabled="savingProfile"
                  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer">
            <i v-if="savingProfile" class="fa-solid fa-spinner fa-spin mr-1"></i>
            <i v-else class="fa-solid fa-save mr-1"></i>
            儲存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
