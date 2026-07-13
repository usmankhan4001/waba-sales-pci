const crypto = require('crypto');

const store = new Map(); // uuid -> { domain, fileId, filename, accessToken, expiresAt }
const TTL = 1000 * 60 * 60; // 1 hour

// accessToken is the caller's own live Bitrix token (from BX24.getAuthData() on the frontend),
// not the backend's persisted install-level admin token - the latter lives in tokens.json,
// which doesn't survive a redeploy without a mounted volume, silently breaking every file
// download until the app is manually reinstalled. Using the live per-request token instead
// means this route has no dependency on that persisted state at all.
function createToken(domain, fileId, filename, accessToken) {
  const token = crypto.randomUUID();
  store.set(token, {
    domain,
    fileId,
    filename,
    accessToken,
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
