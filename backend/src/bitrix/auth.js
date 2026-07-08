const axios = require('axios');
const config = require('../config');
const tokenStore = require('../store/tokenStore');

const OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';

function saveInstallAuth({ domain, protocol, authId, authExpires, refreshId, memberId }) {
  tokenStore.saveBitrixAuth(domain, {
    domain,
    protocol: protocol || 'https',
    accessToken: authId,
    refreshToken: refreshId,
    memberId,
    expiresAt: Date.now() + Number(authExpires || 3600) * 1000,
  });
}

async function refreshAuth(domain) {
  const auth = tokenStore.getBitrixAuth(domain);
  if (!auth) throw new Error(`No stored Bitrix auth for domain ${domain}`);

  const { data } = await axios.get(OAUTH_URL, {
    params: {
      grant_type: 'refresh_token',
      client_id: config.bitrix.clientId,
      client_secret: config.bitrix.clientSecret,
      refresh_token: auth.refreshToken,
    },
  });

  const updated = {
    ...auth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  tokenStore.saveBitrixAuth(domain, updated);
  return updated;
}

async function getValidAuth(domain) {
  let auth = tokenStore.getBitrixAuth(domain);
  if (!auth) throw new Error(`Portal ${domain} is not installed / not authenticated`);
  if (Date.now() > auth.expiresAt - 60_000) {
    auth = await refreshAuth(domain);
  }
  return auth;
}

module.exports = { saveInstallAuth, refreshAuth, getValidAuth };
