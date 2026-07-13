const { createJsonStore } = require('../lib/fileStore');

// Caches the response for a client-supplied Idempotency-Key so a frontend retry on a
// network blip (timeout, dropped connection) replays the original result instead of
// re-sending the WhatsApp template and double-consuming the daily rate limit.
const store = createJsonStore('idempotencyKeys.json');
const TTL_MS = 15 * 60 * 1000;

async function getCachedResponse(key) {
  const data = store.read();
  const entry = data[key];
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.response;
}

async function cacheResponse(key, response) {
  return store.update((data) => {
    data[key] = { response, expiresAt: Date.now() + TTL_MS };
    for (const k of Object.keys(data)) {
      if (data[k].expiresAt < Date.now()) delete data[k];
    }
  });
}

module.exports = { getCachedResponse, cacheResponse };
