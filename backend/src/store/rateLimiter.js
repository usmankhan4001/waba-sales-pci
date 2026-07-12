const fs = require('fs');
const path = require('path');
const config = require('../config');
const { withFileLock } = require('./withFileLock');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'sendCounts.json');

function todayKey(userId) {
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}:${day}`;
}

function read() {
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.warn(`[rateLimiter] Error parsing ${FILE}, resetting to empty:`, err.message);
    return {};
  }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/**
 * Guardrail 8.1: rate-limit sends per executive per day. Throws if over ceiling.
 * userId is the lead's ASSIGNED_BY_ID, which can be undefined for unassigned leads - in that
 * case fallbackKey (the executive's own CTA number) keeps the bucket scoped per-person instead
 * of every unassigned-lead send sharing one global bucket.
 */
async function checkAndIncrement(userId, fallbackKey) {
  return withFileLock(FILE, () => {
    const data = read();
    const key = todayKey(userId || `cta:${fallbackKey || 'unknown'}`);
    const count = data[key] || 0;
    if (count >= config.dailySendLimitPerExecutive) {
      const err = new Error(`Daily send limit (${config.dailySendLimitPerExecutive}) reached for this user`);
      err.rateLimited = true;
      throw err;
    }
    data[key] = count + 1;
    write(data);
  });
}

module.exports = { checkAndIncrement };
