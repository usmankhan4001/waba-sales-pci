const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'connectTokens.json');
const TTL_MS = 24 * 60 * 60 * 1000; // FR-15/16: short-lived, generated fresh per send

function read() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function createToken(whatsappNumber) {
  const token = crypto.randomBytes(12).toString('base64url');
  const data = read();
  data[token] = { number: whatsappNumber, expiresAt: Date.now() + TTL_MS };
  write(data);
  return token;
}

/** Returns the WhatsApp number for a valid, unexpired token, or null. */
function resolveToken(token) {
  const data = read();
  const entry = data[token];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete data[token];
    write(data);
    return null;
  }
  return entry.number;
}

module.exports = { createToken, resolveToken };
