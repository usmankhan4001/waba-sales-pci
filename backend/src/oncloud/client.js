const config = require('../config');
const tokenStore = require('../store/tokenStore');
const httpClient = require('../lib/httpClient');

let inFlightLogin = null;
async function login() {
  if (inFlightLogin) return inFlightLogin;
  inFlightLogin = (async () => {
    const form = new URLSearchParams();
    form.append('email', config.oncloud.email);
    form.append('password', config.oncloud.password);

    const { data } = await httpClient.post(`${config.oncloud.baseUrl}/api/login`, form);
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
  const { data } = await httpClient.get(`${config.oncloud.baseUrl}/api/wpbox/getTemplates`, {
    params: { token },
  });
  const templates = data.templates || [];
  templatesCache = { fetchedAt: Date.now(), templates };
  return templates;
}

const CONTACTS_CACHE_TTL_MS = 5 * 60_000;
let contactsCache = null; // { fetchedAt, byPhone: Map }

/** Used by the delivery-status reconciliation job to look up an OnCloud contact_id for a
 * phone number (getMessages requires contact_id, not phone) - cached briefly since this
 * account has thousands of contacts and the endpoint has no server-side phone filter. */
async function findContactIdByPhone(phone) {
  if (!contactsCache || Date.now() - contactsCache.fetchedAt >= CONTACTS_CACHE_TTL_MS) {
    const token = await getToken();
    const { data } = await httpClient.get(`${config.oncloud.baseUrl}/api/wpbox/getContacts`, {
      params: { token },
    });
    const byPhone = new Map();
    for (const c of data.contacts || []) {
      byPhone.set(String(c.phone || '').replace(/\D/g, ''), c.id);
    }
    contactsCache = { fetchedAt: Date.now(), byPhone };
  }
  return contactsCache.byPhone.get(String(phone).replace(/\D/g, '')) || null;
}

/** Real per-message delivery status/errors (e.g. Meta's "healthy ecosystem engagement"
 * throttle, "Media upload error") only show up here - sendTemplateMessage's response is
 * just a queued/success envelope, not delivery truth. Used by the reconciliation job. */
async function getMessagesForContact(contactId) {
  const token = await getToken();
  const { data } = await httpClient.post(`${config.oncloud.baseUrl}/api/wpbox/getMessages`, {
    token,
    contact_id: contactId,
  });
  return data.data || [];
}

async function sendTemplateMessageOnce({ phone, templateName, templateLanguage = 'en', components = [] }) {
  const token = await getToken();
  const { data } = await httpClient.post(`${config.oncloud.baseUrl}/api/wpbox/sendtemplatemessage`, {
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
  findContactIdByPhone,
  getMessagesForContact,
  textComponent,
  documentHeaderComponent,
  videoHeaderComponent,
  imageHeaderComponent,
  urlButtonComponent,
};
