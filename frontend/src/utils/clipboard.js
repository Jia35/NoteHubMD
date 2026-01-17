/**
 * clipboard.js
 * Utility for copying text to clipboard with fallback for HTTP contexts
 */

/**
 * Copies text to clipboard, using navigator.clipboard if available (HTTPS),
 * or falling back to document.execCommand('copy') for HTTP.
 * 
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} - Resolves to true if successful, false otherwise
 */
export const copyToClipboard = async (text) => {
    if (!text) return false

    // 1. Try Modern API (navigator.clipboard)
    // This requires a secure context (HTTPS) or localhost
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text)
            return true
        } catch (err) {
            console.warn('Navigator clipboard failed, trying fallback:', err)
            // Continue to fallback
        }
    }

    // 2. Fallback: textarea + execCommand
    // This works in HTTP contexts
    try {
        const textArea = document.createElement('textarea')

        // Ensure it's not visible but part of the DOM
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        textArea.style.top = '0'
        textArea.style.opacity = '0'

        document.body.appendChild(textArea)

        // Select the text
        textArea.focus()
        textArea.select()

        // Execute copy
        const successful = document.execCommand('copy')

        // Cleanup
        document.body.removeChild(textArea)

        return successful
    } catch (err) {
        console.error('Fallback copy failed:', err)
        return false
    }
}

export default copyToClipboard
