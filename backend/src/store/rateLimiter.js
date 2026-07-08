const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'sendCounts.json');

function todayKey(userId) {
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}:${day}`;
}

function read() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/** Guardrail 8.1: rate-limit sends per executive per day. Throws if over ceiling. */
function checkAndIncrement(userId) {
  const data = read();
  const key = todayKey(userId);
  const count = data[key] || 0;
  if (count >= config.dailySendLimitPerExecutive) {
    const err = new Error(`Daily send limit (${config.dailySendLimitPerExecutive}) reached for this user`);
    err.rateLimited = true;
    throw err;
  }
  data[key] = count + 1;
  write(data);
}

module.exports = { checkAndIncrement };
