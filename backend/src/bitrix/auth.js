const config = require('../config');
const tokenStore = require('../store/tokenStore');
const httpClient = require('../lib/httpClient');

const OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/';

async function saveInstallAuth({ domain, protocol, authId, authExpires, refreshId, memberId }) {
  return tokenStore.saveBitrixAuth(domain, {
    domain,
    protocol: protocol || 'https',
    accessToken: authId,
    refreshToken: refreshId,
    memberId,
    expiresAt: Date.now() + Number(authExpires || 3600) * 1000,
  });
}

// Bitrix refresh_tokens are single-use - two concurrent callers refreshing the same expiring
// token would both submit it, and the loser's request fails (or worse, clobbers the winner's
// freshly-rotated token in storage). Dedupe concurrent refreshes per domain into one in-flight call.
const inFlightRefreshes = new Map();

async function refreshAuth(domain) {
  if (inFlightRefreshes.has(domain)) return inFlightRefreshes.get(domain);

  const promise = (async () => {
    const auth = tokenStore.getBitrixAuth(domain);
    if (!auth) throw new Error(`No stored Bitrix auth for domain ${domain}`);

    const { data } = await httpClient.get(OAUTH_URL, {
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
      refreshToken: data.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    };
    await tokenStore.saveBitrixAuth(domain, updated);
    return updated;
  })();

  inFlightRefreshes.set(domain, promise);
  try {
    return await promise;
  } finally {
    inFlightRefreshes.delete(domain);
  }
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
