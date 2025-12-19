const { customAlphabet } = require('nanoid');

// Custom alphabet excluding ambiguous characters (0, 1, i, l, o)
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';

// Create custom nanoid generator with 9-char length
const nanoid = customAlphabet(alphabet, 9);

function generateId() {
  return nanoid();
}

module.exports = { generateId };
