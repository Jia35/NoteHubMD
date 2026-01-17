/**
 * Encryption Utility - AES 加密/解密工具
 * 用於加密敏感資料（如 API Key）
 */
const crypto = require('crypto');

// 從環境變數取得加密金鑰，或使用預設值（生產環境應設定 ENCRYPTION_KEY）
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'notehubmd-default-encryption-key-32';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * 加密字串
 * @param {string} text - 要加密的明文
 * @returns {string} - 加密後的字串 (iv:encrypted)
 */
function encrypt(text) {
    if (!text) return text;

    try {
        // 確保金鑰長度為 32 bytes
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return iv.toString('hex') + ':' + encrypted;
    } catch (e) {
        console.error('Encryption failed:', e);
        return text;
    }
}

/**
 * 解密字串
 * @param {string} encryptedText - 加密的字串 (iv:encrypted)
 * @returns {string} - 解密後的明文
 */
function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;

    // Check if it's in encrypted format: 32-char hex IV + colon + encrypted data
    if (!/^[a-f0-9]{32}:/.test(encryptedText)) {
        return encryptedText;
    }

    try {
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        // Only split on first colon to separate IV from encrypted data
        const colonIndex = encryptedText.indexOf(':');
        const iv = Buffer.from(encryptedText.substring(0, colonIndex), 'hex');
        const encrypted = encryptedText.substring(colonIndex + 1);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e) {
        console.error('Decryption failed:', e);
        return encryptedText;
    }
}

/**
 * 遮罩敏感字串 (用於前端顯示)
 * @param {string} text - 原始字串
 * @param {number} visibleChars - 顯示的字元數
 * @returns {string} - 遮罩後的字串
 */
function mask(text, visibleChars = 5) {
    if (!text || text.length <= visibleChars) return '****';
    return text.substring(0, visibleChars) + '*'.repeat(text.length-visibleChars);
}

module.exports = {
    encrypt,
    decrypt,
    mask
};
