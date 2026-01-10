/**
 * Webhook Utility
 * Sends POST requests to configured webhook URLs
 */

const config = require('../config');

/**
 * Send a webhook request (non-blocking)
 * @param {string} url - The webhook URL
 * @param {object} payload - The data to send
 * @returns {Promise<boolean>} - Success status
 */
async function sendWebhook(url, payload) {
    if (!url) return false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'NoteHubMD-Webhook/1.0'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`Webhook failed: ${response.status} ${response.statusText}`);
            return false;
        }

        console.log(`Webhook sent successfully to ${url}`);
        return true;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`Webhook timeout: ${url}`);
        } else {
            console.error(`Webhook error: ${error.message}`);
        }
        return false;
    }
}

/**
 * Send comment webhook notification
 * @param {object} note - The note object
 * @param {object} comment - The comment object (with user)
 * @param {object|null} parentComment - The parent comment if reply (with user)
 */
async function sendCommentWebhook(note, comment, parentComment = null) {
    const url = config.webhook?.commentUrl;
    if (!url) return;

    const baseUrl = process.env.BASE_URL || `http://localhost:${config.server.port}`;

    const payload = {
        event: 'comment.created',
        timestamp: new Date().toISOString(),
        note: {
            id: note.id,
            title: note.title || 'Untitled',
            type: note.noteType || 'markdown',
            shareUrl: note.shareId ? `${baseUrl}/s/${note.shareId}` : null,
            owner: note.owner ? {
                id: note.owner.id,
                username: note.owner.username,
                name: note.owner.name || null
            } : null,
            lastEditor: note.lastEditor ? {
                id: note.lastEditor.id,
                username: note.lastEditor.username,
                name: note.lastEditor.name || null
            } : null
        },
        comment: {
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            user: comment.user ? {
                id: comment.user.id,
                username: comment.user.username,
                name: comment.user.name || null
            } : null
        },
        parent: parentComment ? {
            id: parentComment.id,
            content: parentComment.content,
            createdAt: parentComment.createdAt,
            user: parentComment.user ? {
                id: parentComment.user.id,
                username: parentComment.user.username,
                name: parentComment.user.name || null
            } : null
        } : null
    };

    // Send webhook asynchronously (don't await)
    sendWebhook(url, payload).catch(err => {
        console.error('Comment webhook failed:', err.message);
    });
}

module.exports = {
    sendWebhook,
    sendCommentWebhook
};
