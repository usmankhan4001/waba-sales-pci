const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { withFileLock } = require('./withFileLock');
const { atomicWriteFile, ensureDataDir, DATA_DIR } = require('../lib/fileStore');

const FILE = path.join(DATA_DIR, 'analytics.jsonl');

/**
 * Append-only log, one JSON object per line - one entry per template message result.
 * OnCloud's send response is only "queued", not delivery truth (see reconcileDelivery.js) -
 * every entry starts with deliveryStatus 'unknown' and gets patched in place via
 * updateDeliveryStatus once the real outcome (delivered/failed + Meta's error text) is known.
 */
async function record(entry) {
  return withFileLock(FILE, () => {
    ensureDataDir();
    const id = crypto.randomUUID();
    const line = JSON.stringify({ id, ...entry, deliveryStatus: 'unknown', timestamp: new Date().toISOString() }) + '\n';
    fs.appendFileSync(FILE, line);
    return id;
  });
}

function readAll() {
  if (!fs.existsSync(FILE)) return [];
  return fs
    .readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Patches the delivery-status fields of a previously-recorded entry, matched by id or by
 * the OnCloud message id / WhatsApp wamid captured at send time. Rewrites the whole file
 * atomically - analytics volume here is small enough (per-send-attempt, not per-request)
 * that a full rewrite per status update is fine; revisit only if that changes. */
async function updateDeliveryStatus(matcher, statusFields) {
  return withFileLock(FILE, () => {
    const entries = readAll();
    const idx = entries.findIndex(
      (e) =>
        (matcher.id && e.id === matcher.id) ||
        (matcher.oncloudMessageId && e.oncloudMessageId === matcher.oncloudMessageId) ||
        (matcher.oncloudWamid && e.oncloudWamid === matcher.oncloudWamid)
    );
    if (idx === -1) return false;
    entries[idx] = { ...entries[idx], ...statusFields, statusUpdatedAt: new Date().toISOString() };
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    atomicWriteFile(FILE, content);
    return true;
  });
}

module.exports = { record, readAll, updateDeliveryStatus };
