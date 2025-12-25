/**
 * Utility Functions Composable
 */

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout
    return function (...args) {
        const context = this
        clearTimeout(timeout)
        timeout = setTimeout(() => func.apply(context, args), wait)
    }
}

/**
 * Extract tags from markdown content (CodiMD style)
 * Supports: ###### tags: `tag1` `tag2` or ###### tags: `tag1`、`tag2`
 */
export function extractTags(content) {
    if (!content) return []
    const match = content.match(/^#{1,6}\s*tags:\s*(.+)$/im)
    if (!match) return []
    const tagMatches = match[1].match(/`([^`]+)`/g)
    if (!tagMatches) return []
    return tagMatches.map(t => t.replace(/`/g, '').trim()).filter(Boolean)
}

/**
 * Compress image before upload (max 512px for avatar)
 * Preserves GIF (for animation) and PNG (for transparency)
 */
export async function compressImage(file, maxWidth = 512, maxHeight = 512, quality = 0.8) {
    const isGif = file.type === 'image/gif'
    const isPng = file.type === 'image/png'

    // For GIF: check size only, don't compress (preserves animation)
    if (isGif) {
        if (file.size <= 2 * 1024 * 1024) {
            return file // Under 2MB, use as-is
        }
        throw new Error('GIF 檔案過大（最大 2MB）。請選擇較小的 GIF 或使用其他圖片格式。')
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                let width = img.width
                let height = img.height

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height)
                    width = Math.round(width * ratio)
                    height = Math.round(height * ratio)
                }

                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, width, height)

                // Use PNG for transparency, JPEG for others
                const outputType = isPng ? 'image/png' : 'image/jpeg'
                const outputQuality = isPng ? undefined : quality

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const ext = isPng ? '.png' : '.jpg'
                            const baseName = file.name.replace(/\.[^/.]+$/, '') + ext
                            const compressedFile = new File([blob], baseName, {
                                type: outputType,
                                lastModified: Date.now()
                            })
                            resolve(compressedFile)
                        } else {
                            reject(new Error('Failed to compress image'))
                        }
                    },
                    outputType,
                    outputQuality
                )
            }
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = e.target.result
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

/**
 * Format date using dayjs
 */
export function formatDate(date, format = 'YYYY/MM/DD HH:mm') {
    if (!date) return ''
    return window.dayjs ? window.dayjs(date).format(format) : new Date(date).toLocaleString()
}

/**
 * Get relative time using dayjs
 */
export function relativeTime(date) {
    if (!date) return ''
    return window.dayjs ? window.dayjs(date).fromNow() : ''
}

export function useUtils() {
    return {
        debounce,
        extractTags,
        compressImage,
        formatDate,
        relativeTime
    }
}
