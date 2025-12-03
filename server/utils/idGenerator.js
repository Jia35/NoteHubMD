const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';

function generateId(length = 8) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}

module.exports = { generateId };
