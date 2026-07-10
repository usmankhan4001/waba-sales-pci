const crypto = require('crypto');

const store = new Map(); // uuid -> { domain, fileId, filename, expiresAt }
const TTL = 1000 * 60 * 60; // 1 hour

function createToken(domain, fileId, filename) {
  const token = crypto.randomUUID();
  store.set(token, {
    domain,
    fileId,
    filename,
    expiresAt: Date.now() + TTL
  });
  return token;
}

function resolveToken(token) {
  const data = store.get(token);
  if (!data) return null;
  if (Date.now() > data.expiresAt) {
    store.delete(token);
    return null;
  }
  return data;
}

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of store.entries()) {
    if (now > data.expiresAt) {
      store.delete(token);
    }
  }
}, TTL);

module.exports = { createToken, resolveToken };
