const { customAlphabet } = require('nanoid');

// Custom alphabet excluding ambiguous characters (0, 1, i, l, o)
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';

// Create custom nanoid generator with 9-char length for Note/Book IDs
const nanoid = customAlphabet(alphabet, 9);

// Create custom nanoid generator with 7-char length for Share IDs
const nanoidShare = customAlphabet(alphabet, 7);

function generateId() {
  return nanoid();
}

function generateShareId() {
  return nanoidShare();
}

module.exports = { generateId, generateShareId };
