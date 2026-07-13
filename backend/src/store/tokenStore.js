const { createJsonStore } = require('../lib/fileStore');

const store = createJsonStore('tokens.json');

async function saveBitrixAuth(domain, auth) {
  return store.update((data) => {
    data.bitrix = data.bitrix || {};
    data.bitrix[domain] = auth;
  });
}

function getBitrixAuth(domain) {
  const data = store.read();
  return data.bitrix && data.bitrix[domain];
}

async function saveOncloudToken(token) {
  return store.update((data) => {
    data.oncloud = { token, fetchedAt: Date.now() };
  });
}

function getOncloudToken() {
  const data = store.read();
  return data.oncloud && data.oncloud.token;
}

/** Used by the health check (Phase 2) to detect "app looks up but has no real Bitrix auth". */
function hasAnyBitrixAuth() {
  const data = store.read();
  return Boolean(data.bitrix && Object.keys(data.bitrix).length > 0);
}

module.exports = { saveBitrixAuth, getBitrixAuth, saveOncloudToken, getOncloudToken, hasAnyBitrixAuth };
