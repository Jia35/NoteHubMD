<script setup>
/**
 * RevisionsModal - 版本紀錄/歷史 Modal
 */
import { ref, watch, computed } from 'vue'
import api from '@/composables/useApi'
import dayjs from 'dayjs'
import DiffMatchPatch from 'diff-match-patch'

const dmp = new DiffMatchPatch()

const props = defineProps({
  show: Boolean,
  noteId: String,
  noteTitle: { type: String, default: '' },
  canEdit: { type: Boolean, default: false },
  currentContent: { type: String, default: '' }
})

const emit = defineEmits(['close', 'restore'])

// State
const revisions = ref([])
const revisionsLoading = ref(false)
const selectedRevision = ref(null)
const revisionLoading = ref(false)
const revisionContent = ref('')
const diffHtml = ref('')
const diffCompareMode = ref('previous')
const savingVersion = ref(false)
const previousRevisionContent = ref('')

// Load revisions when modal opens
watch(() => props.show, async (newVal) => {
  if (newVal && props.noteId) {
    await loadRevisions()
  } else {
    // Reset state when modal closes
    revisions.value = []
    selectedRevision.value = null
    diffHtml.value = ''
    previousRevisionContent.value = ''
  }
})

// Load revisions
const loadRevisions = async () => {
  revisionsLoading.value = true
  try {
    revisions.value = await api.getNoteRevisions(props.noteId)
  } catch (e) {
    console.error('Failed to load revisions:', e)
  } finally {
    revisionsLoading.value = false
  }
}

// Select revision
const selectRevision = async (rev) => {
  selectedRevision.value = rev
  revisionLoading.value = true
  try {
    const data = await api.getRevision(props.noteId, rev.id)
    revisionContent.value = data.content || ''
    
    // Load previous revision content for comparison
    const idx = revisions.value.findIndex(r => r.id === rev.id)
    if (idx < revisions.value.length - 1) {
      const prevRev = revisions.value[idx + 1]
      const prevData = await api.getRevision(props.noteId, prevRev.id)
      previousRevisionContent.value = prevData.content || ''
    } else {
      previousRevisionContent.value = ''
    }
    
    recalculateDiff()
  } catch (e) {
    console.error('Failed to load revision:', e)
  } finally {
    revisionLoading.value = false
  }
}

// Check if selected revision is the first (oldest) one
const isFirstRevision = computed(() => {
  if (!selectedRevision.value || revisions.value.length === 0) return false
  const idx = revisions.value.findIndex(r => r.id === selectedRevision.value.id)
  return idx === revisions.value.length - 1
})

// Calculate diff with diff-match-patch
const recalculateDiff = () => {
  if (!selectedRevision.value) return
  
  let fromContent = ''
  let toContent = ''
  
  if (diffCompareMode.value === 'current') {
    // "與目前版本比較": show what changed from selected version to current
    // diff(selected version → current version)
    fromContent = revisionContent.value || ''
    toContent = props.currentContent || ''
  } else {
    // "與上一版本比較": show what changed from previous version to selected version
    // diff(previous version → selected version)
    // For the first version, there's no previous version
    if (isFirstRevision.value) {
      // First version: just show content without diff markers
      const escapedText = escapeHtml(revisionContent.value || '').replace(/\n/g, '<br>')
      diffHtml.value = `<span class="text-gray-800 dark:text-gray-200">${escapedText}</span>`
      return
    }
    fromContent = previousRevisionContent.value || ''
    toContent = revisionContent.value || ''
  }
  
  // Use diff-match-patch to calculate differences
  const diffs = dmp.diff_main(fromContent, toContent)
  dmp.diff_cleanupSemantic(diffs)
  
  // Generate HTML with highlighting
  let html = ''
  for (const [op, text] of diffs) {
    const escapedText = escapeHtml(text).replace(/\n/g, '<br>')
    if (op === 1) { // DIFF_INSERT
      html += `<span class="bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200">${escapedText}</span>`
    } else if (op === -1) { // DIFF_DELETE
      html += `<span class="bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200 line-through">${escapedText}</span>`
    } else {
      // Unchanged text - use gray to highlight the differences
      html += `<span class="text-gray-400 dark:text-gray-500">${escapedText}</span>`
    }
  }
  
  diffHtml.value = html
}

// Escape HTML
const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Save current version
const saveCurrentVersion = async () => {
  savingVersion.value = true
  try {
    await api.saveRevision(props.noteId)
    await loadRevisions()
  } catch (e) {
    console.error('Failed to save version:', e)
  } finally {
    savingVersion.value = false
  }
}

// Confirm restore revision
const confirmRestoreRevision = async () => {
  if (!selectedRevision.value) return
  
  try {
    await api.restoreRevision(props.noteId, selectedRevision.value.id)
    emit('restore', revisionContent.value)
    emit('close')
  } catch (e) {
    console.error('Failed to restore revision:', e)
  }
}

// Download revision as .md file
const downloadRevision = () => {
  if (!selectedRevision.value || !revisionContent.value) return
  
  const content = revisionContent.value
  const date = dayjs(selectedRevision.value.createdAt).format('YYYYMMDD_HHmmss')
  // Sanitize title for filename (remove invalid characters)
  const safeTitle = (props.noteTitle || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').substring(0, 50)
  const filename = `${safeTitle}_revision_${date}.md`
  
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Format date
const formatDate = (date) => {
  return dayjs(date).format('YYYY/MM/DD HH:mm')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col" style="height: 85vh;">
        <!-- Modal Header -->
        <div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-800/50">
          <h2 class="text-lg font-bold text-gray-800 dark:text-white flex items-center">
            <i class="fa-solid fa-history mr-2 text-blue-500"></i>版本紀錄
            <span class="relative ml-2 group">
              <i class="fa-solid fa-circle-info text-sm text-gray-400 hover:text-blue-500 cursor-help transition"></i>
              <div class="absolute left-0 top-full mt-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 whitespace-pre-line">
                <div class="font-bold mb-1">版本自動儲存規則：</div>
                <ul class="list-disc list-inside space-y-1">
                  <li>閒置 5 分鐘後再編輯會觸發保存</li>
                  <li>距離上次版本保存超過 15 分鐘觸發保存</li>
                  <li>最多保留 50 個歷史版本</li>
                </ul>
              </div>
            </span>
          </h2>
          <button @click="emit('close')" class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        
        <!-- Modal Body -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Revisions List (Left Panel) -->
          <div class="w-72 border-r border-gray-300 dark:border-gray-700 shrink-0 flex flex-col">
            <!-- Scrollable List -->
            <div class="flex-1 overflow-y-auto">
              <div v-if="revisionsLoading" class="p-4 text-center text-gray-500">
                <i class="fa-solid fa-spinner fa-spin mr-2"></i>載入中...
              </div>
              <div v-else-if="revisions.length === 0" class="p-4 text-center text-gray-400 text-sm">
                <i class="fa-solid fa-inbox mb-2 text-2xl block"></i>
                尚無版本紀錄
              </div>
              <div v-else>
                <div v-for="(rev, index) in revisions" :key="rev.id" 
                     @click="selectRevision(rev)"
                     class="p-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition"
                     :class="selectedRevision?.id === rev.id ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'">
                  <div class="flex items-center mb-1">
                    <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white mr-2 shrink-0"
                          :class="rev.editor ? 'bg-blue-600' : 'bg-gray-500'">
                      {{ rev.editor?.username?.charAt(0).toUpperCase() || '?' }}
                    </span>
                    <span class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {{ rev.editor?.name || rev.editor?.username || '未知用戶' }}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 ml-8">
                    {{ formatDate(rev.createdAt) }}
                  </div>
                  <div class="text-xs text-gray-400 dark:text-gray-500 ml-8">
                    {{ rev.length || 0 }} 字元
                  </div>
                </div>
              </div>
            </div>
            <!-- Fixed Footer with Save Button -->
            <div v-if="canEdit" class="shrink-0 p-3 border-t border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button @click="saveCurrentVersion" :disabled="savingVersion"
                      class="w-full px-3 py-2 border-2 border-green-600 text-green-600 dark:text-green-400 dark:border-green-500 text-sm rounded hover:bg-green-50 dark:hover:bg-green-900/30 transition flex items-center justify-center disabled:opacity-50 cursor-pointer">
                <i :class="savingVersion ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-floppy-disk'" class="mr-2"></i>
                儲存目前版本
              </button>
            </div>
          </div>
          
          <!-- Diff View (Right Panel) -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <div v-if="!selectedRevision" class="flex-1 flex items-center justify-center text-gray-400">
              <div class="text-center">
                <i class="fa-solid fa-hand-pointer text-4xl mb-3 block"></i>
                <p>選擇一個版本查看差異</p>
              </div>
            </div>
            <template v-else>
              <!-- Diff Header -->
              <div class="p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shrink-0">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <i class="fa-solid fa-code-compare text-gray-500 dark:text-gray-400"></i>
                    <select v-model="diffCompareMode" @change="recalculateDiff"
                            class="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="previous">與上一版本比較</option>
                      <option value="current">與目前版本比較</option>
                    </select>
                  </div>
                  <div class="flex items-center space-x-2">
                    <button @click="downloadRevision"
                            class="px-3 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer">
                      <i class="fa-solid fa-download mr-1"></i>
                      下載此版本
                    </button>
                    <button v-if="canEdit" @click="confirmRestoreRevision"
                            class="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition cursor-pointer">
                      <i class="fa-solid fa-rotate-left mr-1"></i>
                      還原此版本
                    </button>
                  </div>
                </div>
              </div>
              <!-- Diff Content -->
              <div v-if="revisionLoading" class="flex-1 flex items-center justify-center text-gray-500">
                <i class="fa-solid fa-spinner fa-spin mr-2"></i>載入中...
              </div>
              <div v-else class="flex-1 overflow-auto p-4">
                <div v-html="diffHtml" class="font-mono text-sm whitespace-pre-wrap break-words leading-relaxed"></div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
