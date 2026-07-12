const fs = require('fs');
const path = require('path');
const { withFileLock } = require('./withFileLock');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'suppressedNumbers.json');

function read() {
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.warn(`[suppressionList] Error parsing ${FILE}, resetting to empty:`, err.message);
    return {};
  }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Bitrix's lead.PHONE and OnCloud's incoming-webhook "from" may format the same number
// differently (e.g. "+971 50 123 4567" vs "971501234567") - compare digits only.
function normalize(phone) {
  return String(phone).replace(/\D/g, '');
}

async function suppress(phone, reason) {
  return withFileLock(FILE, () => {
    const data = read();
    data[normalize(phone)] = { reason, suppressedAt: new Date().toISOString() };
    write(data);
  });
}

function isSuppressed(phone) {
  return Boolean(read()[normalize(phone)]);
}

module.exports = { suppress, isSuppressed };
