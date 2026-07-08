const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'suppressedNumbers.json');

function read() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function suppress(phone, reason) {
  const data = read();
  data[phone] = { reason, suppressedAt: new Date().toISOString() };
  write(data);
}

function isSuppressed(phone) {
  return Boolean(read()[phone]);
}

module.exports = { suppress, isSuppressed };
