const axios = require('axios');
const { getValidAuth, refreshAuth } = require('./auth');

// The frontend's B24 SDK may hand back domain as a bare host ("pcicrm.bitrix24.com")
// or a full URL ("https://pcicrm.bitrix24.com") depending on context - normalize to
// a bare host so building "https://${domain}/..." never double-prefixes the protocol.
function normalizeDomain(domain) {
  return String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Calls a Bitrix24 REST method for a given installed portal domain,
 * transparently refreshing the OAuth token once on a 401/expired_token.
 */
async function callMethod(domain, method, params = {}) {
  const auth = await getValidAuth(domain);
  const url = `${auth.protocol}://${auth.domain}/rest/${method}`;

  try {
    const { data } = await axios.post(url, params, {
      params: { auth: auth.accessToken },
    });
    if (data.error === 'expired_token' || data.error === 'invalid_token') {
      throw Object.assign(new Error(data.error), { expired: true });
    }
    return data;
  } catch (err) {
    if (err.expired || err.response?.data?.error === 'expired_token') {
      const refreshed = await refreshAuth(domain);
      const { data } = await axios.post(url, params, {
        params: { auth: refreshed.accessToken },
      });
      return data;
    }
    throw err;
  }
}

/**
 * Calls a Bitrix24 REST method using a caller-supplied access token
 * (e.g. from BX24.getAuth() on the frontend), scoped to that user's own
 * portal permissions rather than the app's install-level admin token.
 */
async function callMethodWithToken(domain, method, params = {}, accessToken) {
  const url = `https://${normalizeDomain(domain)}/rest/${method}`;
  const { data } = await axios.post(url, params, { params: { auth: accessToken } });
  // Bitrix returns errors as HTTP 200 with an {error, error_description} body - axios sees
  // this as success, so without this check a stale/expired token silently produces undefined
  // results downstream (misreported as "Lead not found" etc.) instead of a clear failure.
  if (data.error) {
    const err = new Error(`Bitrix ${method} failed: ${data.error_description || data.error}`);
    err.bitrixError = data.error;
    throw err;
  }
  return data;
}

module.exports = { callMethod, callMethodWithToken };
