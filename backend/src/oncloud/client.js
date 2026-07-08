const axios = require('axios');
const config = require('../config');
const tokenStore = require('../store/tokenStore');

async function login() {
  const form = new URLSearchParams();
  form.append('email', config.oncloud.email);
  form.append('password', config.oncloud.password);

  const { data } = await axios.post(`${config.oncloud.baseUrl}/api/login`, form);
  const token = data.token || data.data?.token;
  if (!token) throw new Error('OnCloud login did not return a token');
  tokenStore.saveOncloudToken(token);
  return token;
}

async function getToken() {
  if (config.oncloud.staticToken) return config.oncloud.staticToken;
  return tokenStore.getOncloudToken() || login();
}

/** FR-14: validate template is approved before sending against it. */
async function getTemplates() {
  const token = await getToken();
  const { data } = await axios.get(`${config.oncloud.baseUrl}/api/wpbox/getTemplates`, {
    params: { token },
  });
  return data.templates || [];
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
