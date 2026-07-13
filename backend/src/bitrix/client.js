const httpClient = require('../lib/httpClient');
const logger = require('../lib/logger');
const { getValidAuth, refreshAuth } = require('./auth');

// The frontend's B24 SDK may hand back domain as a bare host ("pcicrm.bitrix24.com")
// or a full URL ("https://pcicrm.bitrix24.com") depending on context - normalize to
// a bare host so building "https://${domain}/..." never double-prefixes the protocol.
function normalizeDomain(domain) {
  return String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bitrix returns errors as HTTP 200 with an {error, ...} body (see callMethodWithToken's
// comment below) - rate-limit rejections show up this way, not as a real HTTP 429/503,
// though a real 503 is possible too under heavier overload. Retry both with backoff+jitter.
const RATE_LIMIT_ERROR_CODES = new Set(['QUERY_LIMIT_EXCEEDED', 'OVERLOAD_LIMIT']);

function backoffDelayMs(attempt) {
  return 500 * 2 ** (attempt - 1) + Math.random() * 250;
}

/** POSTs to a Bitrix REST URL, retrying up to 3 attempts total on rate-limit signals
 * (QUERY_LIMIT_EXCEEDED/OVERLOAD_LIMIT in the body, or a real 503) before giving up. */
async function postWithRateLimitRetry(url, params, accessToken) {
  const MAX_ATTEMPTS = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data } = await httpClient.post(url, params, { params: { auth: accessToken } });
      if (RATE_LIMIT_ERROR_CODES.has(data.error) && attempt < MAX_ATTEMPTS) {
        const delay = backoffDelayMs(attempt);
        logger.warn({ attempt, error: data.error, url }, '[bitrix] rate-limited, retrying after backoff');
        await sleep(delay);
        continue;
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (err.response?.status === 503 && attempt < MAX_ATTEMPTS) {
        const delay = backoffDelayMs(attempt);
        logger.warn({ attempt, url }, '[bitrix] 503, retrying after backoff');
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Calls a Bitrix24 REST method for a given installed portal domain,
 * transparently refreshing the OAuth token once on a 401/expired_token.
 */
async function callMethod(domain, method, params = {}) {
  const auth = await getValidAuth(domain);
  const url = `${auth.protocol}://${auth.domain}/rest/${method}`;

  try {
    const data = await postWithRateLimitRetry(url, params, auth.accessToken);
    if (data.error === 'expired_token' || data.error === 'invalid_token') {
      throw Object.assign(new Error(data.error), { expired: true });
    }
    return data;
  } catch (err) {
    if (err.expired || err.response?.data?.error === 'expired_token') {
      const refreshed = await refreshAuth(domain);
      return postWithRateLimitRetry(url, params, refreshed.accessToken);
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
  const data = await postWithRateLimitRetry(url, params, accessToken);
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

module.exports = { callMethod, callMethodWithToken, normalizeDomain };
