const crypto = require('crypto');
const { createJsonStore } = require('../lib/fileStore');

const store = createJsonStore('connectTokens.json');
const TTL_MS = 24 * 60 * 60 * 1000; // FR-15/16: short-lived, generated fresh per send

async function createToken(whatsappNumber) {
  return store.update((data) => {
    const token = crypto.randomBytes(12).toString('base64url');
    data[token] = { number: whatsappNumber, expiresAt: Date.now() + TTL_MS };
    return token;
  });
}

/** Returns the WhatsApp number for a valid, unexpired token, or null. */
async function resolveToken(token) {
  return store.update((data) => {
    const entry = data[token];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete data[token];
      return null;
    }
    return entry.number;
  });
}

module.exports = { createToken, resolveToken };
