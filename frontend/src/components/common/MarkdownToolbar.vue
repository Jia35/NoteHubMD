<script setup>
/**
 * MarkdownToolbar - Reusable Markdown formatting toolbar
 * 
 * Props:
 * - textareaRef: ref to the target textarea element
 * - modelValue: the v-model value (text content)
 * 
 * Emits:
 * - update:modelValue: when text is modified
 */
import { nextTick } from 'vue'

const props = defineProps({
  textareaRef: {
    type: Object,
    default: null
  },
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

// Helper to get the actual DOM element from ref (handles ref object, direct element, and ref array)
const getTextarea = () => {
  let ref = props.textareaRef
  if (!ref) return null
  
  // 1. Direct HTMLElement
  if (ref instanceof HTMLElement) return ref
  
  // 2. Array of elements (Vue refs inside v-for) - take the first one
  if (Array.isArray(ref)) {
    return ref.length > 0 ? ref[0] : null
  }
  
  // 3. Vue Ref object - unwrap and check again
  if (typeof ref === 'object' && 'value' in ref) {
    const val = ref.value
    if (val instanceof HTMLElement) return val
    if (Array.isArray(val)) return val.length > 0 ? val[0] : null
  }
  
  return null
}

// Insert markdown formatting (wraps selection)
const insertMarkdown = (prefix, suffix = prefix) => {
  const textarea = getTextarea()
  if (!textarea) return
  
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = props.modelValue
  const selectedText = text.substring(start, end)
  
  const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end)
  emit('update:modelValue', newText)
  
  nextTick(() => {
    textarea.focus()
    if (selectedText) {
      textarea.setSelectionRange(start + prefix.length, end + prefix.length)
    } else {
      textarea.setSelectionRange(start + prefix.length, start + prefix.length)
    }
  })
}

// Insert line prefix (like list items)
const insertPrefix = (prefix) => {
  const textarea = getTextarea()
  if (!textarea) return
  
  const start = textarea.selectionStart
  const text = props.modelValue
  let lineStart = text.lastIndexOf('\n', start - 1) + 1
  
  if (text.substring(lineStart).startsWith(prefix)) {
    const newText = text.substring(0, lineStart) + text.substring(lineStart + prefix.length)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start - prefix.length, start - prefix.length)
    })
  } else {
    const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }
}

// Insert code block
const insertCodeBlock = () => {
  const textarea = getTextarea()
  if (!textarea) return
  
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = props.modelValue
  const selectedText = text.substring(start, end)
  
  const codeBlock = '```\n' + selectedText + '\n```'
  const newText = text.substring(0, start) + codeBlock + text.substring(end)
  emit('update:modelValue', newText)
  
  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(start + 4, start + 4 + selectedText.length)
  })
}

// Insert ordered list
const insertOrderedList = () => {
  const textarea = getTextarea()
  if (!textarea) return
  
  const start = textarea.selectionStart
  const text = props.modelValue
  let lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineText = text.substring(lineStart)
  
  const match = lineText.match(/^(\d+)\.\s/)
  if (match) {
    const prefixLength = match[0].length
    const newText = text.substring(0, lineStart) + text.substring(lineStart + prefixLength)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start - prefixLength, start - prefixLength)
    })
  } else {
    const prefix = '1. '
    const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }
}

// Insert link
const insertLink = () => {
  const textarea = getTextarea()
  if (!textarea) return
  
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = props.modelValue
  const selectedText = text.substring(start, end)
  
  if (selectedText) {
    const newText = text.substring(0, start) + '[' + selectedText + '](url)' + text.substring(end)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(end + 3, end + 6)
    })
  } else {
    const newText = text.substring(0, start) + '[連結文字](url)' + text.substring(end)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + 1, start + 5)
    })
  }
}

// Insert image
const insertImage = () => {
  const textarea = getTextarea()
  if (!textarea) return
  
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = props.modelValue
  const selectedText = text.substring(start, end)
  
  if (selectedText) {
    const newText = text.substring(0, start) + '![' + selectedText + '](圖片網址)' + text.substring(end)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(end + 4, end + 8)
    })
  } else {
    const newText = text.substring(0, start) + '![圖片說明](圖片網址)' + text.substring(end)
    emit('update:modelValue', newText)
    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + 2, start + 6)
    })
  }
}
</script>

<template>
  <div class="flex items-center gap-0.5 p-1.5 bg-gray-100 dark:bg-gray-700 rounded-t-lg border border-b-0 border-gray-300 dark:border-gray-600">
    <button @click="insertMarkdown('**')" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="粗體">
        <i class="fa-solid fa-bold"></i>
    </button>
    <button @click="insertMarkdown('*')" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="斜體">
        <i class="fa-solid fa-italic"></i>
    </button>
    <button @click="insertMarkdown('~~')" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="刪除線">
        <i class="fa-solid fa-strikethrough"></i>
    </button>
    <button @click="insertCodeBlock" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="程式碼區塊">
        <i class="fa-solid fa-code"></i>
    </button>
    <div class="w-px h-4 bg-gray-300 dark:bg-gray-500 mx-0.5"></div>
    <button @click="insertPrefix('- ')" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="無序清單">
        <i class="fa-solid fa-list-ul"></i>
    </button>
    <button @click="insertOrderedList" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="有序清單">
        <i class="fa-solid fa-list-ol"></i>
    </button>
    <button @click="insertPrefix('- [ ] ')" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="勾選清單">
        <i class="fa-regular fa-square-check"></i>
    </button>
    <div class="w-px h-4 bg-gray-300 dark:bg-gray-500 mx-0.5"></div>
    <button @click="insertLink" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="連結">
        <i class="fa-solid fa-link"></i>
    </button>
    <button @click="insertImage" type="button"
        class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors text-xs" title="圖片">
        <i class="fa-solid fa-image"></i>
    </button>
  </div>
</template>
