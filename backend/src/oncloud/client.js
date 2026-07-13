const axios = require('axios');
const config = require('../config');
const tokenStore = require('../store/tokenStore');

let inFlightLogin = null;
async function login() {
  if (inFlightLogin) return inFlightLogin;
  inFlightLogin = (async () => {
    const form = new URLSearchParams();
    form.append('email', config.oncloud.email);
    form.append('password', config.oncloud.password);

    const { data } = await axios.post(`${config.oncloud.baseUrl}/api/login`, form);
    const token = data.token || data.data?.token;
    if (!token) throw new Error('OnCloud login did not return a token');
    tokenStore.saveOncloudToken(token);
    return token;
  })();
  try {
    return await inFlightLogin;
  } finally {
    inFlightLogin = null;
  }
}

async function getToken() {
  if (config.oncloud.staticToken) return config.oncloud.staticToken;
  return tokenStore.getOncloudToken() || login();
}

const TEMPLATES_CACHE_TTL_MS = 60_000;
let templatesCache = null; // { fetchedAt, templates }

/** FR-14: validate template is approved before sending against it. Cached briefly - templates
 * rarely change and this call was adding a full extra round-trip to every single send. */
async function getTemplates() {
  if (templatesCache && Date.now() - templatesCache.fetchedAt < TEMPLATES_CACHE_TTL_MS) {
    return templatesCache.templates;
  }
  const token = await getToken();
  const { data } = await axios.get(`${config.oncloud.baseUrl}/api/wpbox/getTemplates`, {
    params: { token },
  });
  const templates = data.templates || [];
  templatesCache = { fetchedAt: Date.now(), templates };
  return templates;
}

async function sendTemplateMessageOnce({ phone, templateName, templateLanguage = 'en', components = [] }) {
  const token = await getToken();
  const { data } = await axios.post(`${config.oncloud.baseUrl}/api/wpbox/sendtemplatemessage`, {
    token,
    phone,
    template_name: templateName,
    template_language: templateLanguage,
    components,
  });

  console.log(`[oncloud] sendtemplatemessage ${templateName} ->`, JSON.stringify(data));

  // OnCloud returns a queued/success envelope even when Meta later rejects the
  // message (e.g. language mismatch, bad params). Surface those as real errors so
  // the UI stops reporting "sent" for messages the recipient never receives.
  if (data && (data.status === 'error' || data.error || data.success === false)) {
    throw new Error(data.message || data.error || 'OnCloud API returned an error');
  }

  return data;
}

/** Guardrail 8.3: retry once on transient network/5xx before surfacing failure. */
async function sendTemplateMessage(args) {
  try {
    return await sendTemplateMessageOnce(args);
  } catch (err) {
    const status = err.response?.status;
    const transient = !err.response || status >= 500;
    if (!transient) throw err;
    return sendTemplateMessageOnce(args);
  }
}

function textComponent(values) {
  return { type: 'body', parameters: values.map((text) => ({ type: 'text', text: String(text) })) };
}

function documentHeaderComponent(link, filename) {
  return { type: 'header', parameters: [{ type: 'document', document: { link, filename } }] };
}

function videoHeaderComponent(link) {
  return { type: 'header', parameters: [{ type: 'video', video: { link } }] };
}

function imageHeaderComponent(link) {
  return { type: 'header', parameters: [{ type: 'image', image: { link } }] };
}

/**
 * FR-9/FR-15: the approved template's button base URL is configured in Meta as
 * `{BASE_URL}/connect/{{1}}` - this component supplies only the dynamic token suffix.
 */
function urlButtonComponent(dynamicSuffix, index = '0') {
  return { type: 'button', sub_type: 'url', index, parameters: [{ type: 'text', text: dynamicSuffix }] };
}

module.exports = {
  login,
  getToken,
  getTemplates,
  sendTemplateMessage,
  textComponent,
  documentHeaderComponent,
  videoHeaderComponent,
  imageHeaderComponent,
  urlButtonComponent,
};
