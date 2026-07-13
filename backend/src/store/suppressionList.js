const { createJsonStore } = require('../lib/fileStore');

const store = createJsonStore('suppressedNumbers.json');

// Bitrix's lead.PHONE and OnCloud's incoming-webhook "from" may format the same number
// differently (e.g. "+971 50 123 4567" vs "971501234567") - compare digits only.
function normalize(phone) {
  return String(phone).replace(/\D/g, '');
}

async function suppress(phone, reason) {
  return store.update((data) => {
    data[normalize(phone)] = { reason, suppressedAt: new Date().toISOString() };
  });
}

function isSuppressed(phone) {
  return Boolean(store.read()[normalize(phone)]);
}

module.exports = { suppress, isSuppressed };
