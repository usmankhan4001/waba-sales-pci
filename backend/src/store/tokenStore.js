const fs = require('fs');
const path = require('path');
const { withFileLock } = require('./withFileLock');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'tokens.json');

function readAll() {
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.warn(`[tokenStore] Error parsing ${FILE}, resetting to empty:`, err.message);
    return {};
  }
}

function writeAll(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

async function saveBitrixAuth(domain, auth) {
  return withFileLock(FILE, () => {
    const data = readAll();
    data.bitrix = data.bitrix || {};
    data.bitrix[domain] = auth;
    writeAll(data);
  });
}

function getBitrixAuth(domain) {
  const data = readAll();
  return data.bitrix && data.bitrix[domain];
}

async function saveOncloudToken(token) {
  return withFileLock(FILE, () => {
    const data = readAll();
    data.oncloud = { token, fetchedAt: Date.now() };
    writeAll(data);
  });
}

function getOncloudToken() {
  const data = readAll();
  return data.oncloud && data.oncloud.token;
}

module.exports = { saveBitrixAuth, getBitrixAuth, saveOncloudToken, getOncloudToken };
