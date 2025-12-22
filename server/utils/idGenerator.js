const { customAlphabet } = require('nanoid');

// Custom alphabet excluding ambiguous characters (0, 1, i, l, o)
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';

// Create custom nanoid generator with 9-char length for Note/Book IDs (default)
const nanoid = customAlphabet(alphabet, 9);

// Create custom nanoid generator with 7-char length for Share IDs
const nanoidShare = customAlphabet(alphabet, 7);

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

module.exports = { generateId, generateShareId };
