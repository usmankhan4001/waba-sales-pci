const bitrixClient = require('../bitrix/client');
const logger = require('../lib/logger');

const ENTITY_TYPE_ENDPOINTS = { 1: 'crm.lead.get', 2: 'crm.deal.get', 3: 'crm.contact.get' };

/** Single source of truth for the entityTypeId -> Bitrix REST method mapping, previously
 * duplicated between this backend (send.js) and the frontend's onMounted handler. */
function entityEndpointFor(entityTypeId) {
  return ENTITY_TYPE_ENDPOINTS[entityTypeId] || ENTITY_TYPE_ENDPOINTS[1];
}

function normalizePhones(rawPhones) {
  if (Array.isArray(rawPhones)) return rawPhones;
  if (!rawPhones || typeof rawPhones !== 'object') return [];
  return Object.values(rawPhones).filter(Boolean);
}

function pickBestPhone(phones) {
  return phones.find((p) => p.VALUE_TYPE === 'MOBILE') || phones.find((p) => p.VALUE_TYPE === 'WORK') || phones[0] || null;
}

/** Single source of truth for phone resolution (including the linked-contact fallback
 * lookup), previously duplicated between this backend (send.js) and the frontend's
 * onMounted handler. Also surfaces the linked contact's name, if one was looked up - the
 * frontend previously used this as a display-name fallback when the lead/deal itself has
 * no NAME/TITLE of its own. */
async function resolveEntityPhones(domain, accessToken, entityData) {
  let phones = normalizePhones(entityData.PHONE);
  let contactName = null;

  if (phones.length === 0 && entityData.FM?.PHONE) {
    phones = normalizePhones(entityData.FM.PHONE);
  }

  const candidateContactIds = [
    entityData.CONTACT_ID,
    ...(Array.isArray(entityData.CONTACT_IDS) ? entityData.CONTACT_IDS : []),
    ...(Array.isArray(entityData.CONTACT_BINDINGS) ? entityData.CONTACT_BINDINGS.map((binding) => binding.CONTACT_ID) : []),
  ].filter(Boolean);

  for (const contactId of candidateContactIds) {
    if (phones.length > 0) break;
    try {
      const contactResp = await bitrixClient.callMethodWithToken(domain, 'crm.contact.get', { id: contactId }, accessToken);
      const contactData = contactResp.result || {};
      phones = normalizePhones(contactData.PHONE);
      if (phones.length === 0 && contactData.FM?.PHONE) {
        phones = normalizePhones(contactData.FM.PHONE);
      }
      contactName = [contactData.NAME, contactData.LAST_NAME].filter(Boolean).join(' ') || null;
    } catch (err) {
      logger.warn({ contactId, err }, '[leadData] failed to fetch linked contact');
    }
  }

  return { phones, contactName };
}

/** Fetches the CRM entity for the given type and resolves its best phone number and
 * display name - used by both POST /api/send and POST /api/lead-data, so the frontend no
 * longer needs its own copy of entity-type mapping or phone resolution. Returns null if
 * the record doesn't exist. */
async function fetchEntityWithPhone(domain, accessToken, leadId, entityTypeId) {
  const endpoint = entityEndpointFor(entityTypeId);
  const entityResp = await bitrixClient.callMethodWithToken(domain, endpoint, { id: leadId }, accessToken);
  const entityData = entityResp.result;
  if (!entityData) return null;

  const { phones, contactName } = await resolveEntityPhones(domain, accessToken, entityData);
  const bestPhone = pickBestPhone(phones);
  const phone = bestPhone?.VALUE ? bestPhone.VALUE.replace(/\D/g, '') : null;
  const leadName = [entityData.NAME, entityData.LAST_NAME].filter(Boolean).join(' ') || entityData.TITLE || contactName || '';

  return { entityData, phone, leadName };
}

module.exports = { entityEndpointFor, resolveEntityPhones, normalizePhones, pickBestPhone, fetchEntityWithPhone };
