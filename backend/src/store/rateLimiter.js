const config = require('../config');
const { createJsonStore } = require('../lib/fileStore');

const store = createJsonStore('sendCounts.json');

function todayKey(userId) {
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}:${day}`;
}

/**
 * Guardrail 8.1: rate-limit sends per executive per day. userId is the lead's
 * ASSIGNED_BY_ID, which can be undefined for unassigned leads - in that case fallbackKey
 * (the executive's own CTA number) keeps the bucket scoped per-person instead of every
 * unassigned-lead send sharing one global bucket.
 */
function keyFor(userId, fallbackKey) {
  return todayKey(userId || `cta:${fallbackKey || 'unknown'}`);
}

/** Read-only check - throws if this executive is already at/over today's ceiling.
 * Does NOT consume a slot; call recordSuccess separately once a send actually succeeds,
 * so a failed attempt never burns quota it didn't use. */
function assertUnderLimit(userId, fallbackKey) {
  const data = store.read();
  const count = data[keyFor(userId, fallbackKey)] || 0;
  if (count >= config.dailySendLimitPerExecutive) {
    const err = new Error(`Daily send limit (${config.dailySendLimitPerExecutive}) reached for this user`);
    err.rateLimited = true;
    throw err;
  }
}

/** Consumes one daily-send slot. Call only after a message actually succeeds. */
async function recordSuccess(userId, fallbackKey) {
  return store.update((data) => {
    const key = keyFor(userId, fallbackKey);
    data[key] = (data[key] || 0) + 1;
  });
}

module.exports = { assertUnderLimit, recordSuccess };
