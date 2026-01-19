const { customAlphabet } = require('nanoid');

// Custom alphabet excluding ambiguous characters (0, 1, i, l, o)
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';

// Base62 alphabet for image IDs (a-z, A-Z, 0-9)
const base62Alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Create custom nanoid generator with 9-char length for Note/Book IDs (default)
const nanoid = customAlphabet(alphabet, 9);

// Create custom nanoid generator with 7-char length for Share IDs
const nanoidShare = customAlphabet(alphabet, 7);

// Create custom nanoid generator with 8-char Base62 for Image IDs
const nanoidImage = customAlphabet(base62Alphabet, 8);

// Create custom nanoid generator with 30-char Base62 for API Keys (will be prefixed with sk-nh-)
const nanoidApiKey = customAlphabet(base62Alphabet, 30);

/**
 * Generate a unique ID
 * @param {number} [length=9] - Length of the ID (defaults to 9 for Note/Book IDs)
 * @returns {string} - Generated ID
 */
function generateId(length) {
  if (length && length !== 9) {
    const customNanoid = customAlphabet(alphabet, length);
    return customNanoid();
  }
  return nanoid();
}

function generateShareId() {
  return nanoidShare();
}

/**
 * Generate a unique Image ID (8-char Base62)
 * @returns {string} - Generated 8-character Base62 ID
 */
function generateImageId() {
  return nanoidImage();
}

/**
 * Generate a unique API Key (sk-nh-{30-char Base62})
 * @returns {string} - Generated API Key with sk-nh- prefix
 */
function generateApiKey() {
  return 'sk-nh-' + nanoidApiKey();
}

module.exports = { generateId, generateShareId, generateImageId, generateApiKey };

