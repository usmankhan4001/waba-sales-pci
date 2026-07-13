const bitrixClient = require('../bitrix/client');
const { entityEndpointFor, fetchEntityWithPhone } = require('./leadData');

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('leadData.entityEndpointFor', () => {
  it.each([
    [undefined, 'crm.lead.get'],
    [1, 'crm.lead.get'],
    [2, 'crm.deal.get'],
    [3, 'crm.contact.get'],
    [99, 'crm.lead.get'],
  ])('entityTypeId %s -> %s', (entityTypeId, expected) => {
    expect(entityEndpointFor(entityTypeId)).toBe(expected);
  });
});

describe('leadData.fetchEntityWithPhone', () => {
  it('returns null when the entity does not exist', async () => {
    vi.spyOn(bitrixClient, 'callMethodWithToken').mockResolvedValue({ result: null });
    const result = await fetchEntityWithPhone('x.bitrix24.com', 'tok', 1, 1);
    expect(result).toBeNull();
  });

  it('resolves the phone directly from the entity when present', async () => {
    vi.spyOn(bitrixClient, 'callMethodWithToken').mockResolvedValue({
      result: { NAME: 'Jane', ASSIGNED_BY_ID: 7, PHONE: [{ VALUE: '+971 50 123 4567', VALUE_TYPE: 'MOBILE' }] },
    });
    const result = await fetchEntityWithPhone('x.bitrix24.com', 'tok', 1, 1);
    expect(result.phone).toBe('971501234567');
    expect(result.leadName).toBe('Jane');
  });

  it('falls back to a linked contact for phone and name when the entity has none', async () => {
    vi.spyOn(bitrixClient, 'callMethodWithToken').mockImplementation(async (domain, method) => {
      if (method === 'crm.lead.get') {
        return { result: { CONTACT_ID: 55, ASSIGNED_BY_ID: 7, PHONE: [] } };
      }
      if (method === 'crm.contact.get') {
        return { result: { NAME: 'Linked', LAST_NAME: 'Contact', PHONE: [{ VALUE: '971509999999', VALUE_TYPE: 'MOBILE' }] } };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const result = await fetchEntityWithPhone('x.bitrix24.com', 'tok', 1, 1);
    expect(result.phone).toBe('971509999999');
    expect(result.leadName).toBe('Linked Contact');
  });

  it('uses crm.deal.get for entityTypeId 2 and crm.contact.get for entityTypeId 3', async () => {
    const spy = vi.spyOn(bitrixClient, 'callMethodWithToken').mockResolvedValue({
      result: { NAME: 'X', ASSIGNED_BY_ID: 1, PHONE: [{ VALUE: '123', VALUE_TYPE: 'MOBILE' }] },
    });

    await fetchEntityWithPhone('x.bitrix24.com', 'tok', 5, 2);
    expect(spy).toHaveBeenCalledWith('x.bitrix24.com', 'crm.deal.get', { id: 5 }, 'tok');

    await fetchEntityWithPhone('x.bitrix24.com', 'tok', 5, 3);
    expect(spy).toHaveBeenCalledWith('x.bitrix24.com', 'crm.contact.get', { id: 5 }, 'tok');
  });
});
