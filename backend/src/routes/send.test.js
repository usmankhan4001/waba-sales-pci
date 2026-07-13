const express = require('express');
const request = require('supertest');
const config = require('../config');
const bitrixClient = require('../bitrix/client');
const oncloud = require('../oncloud/client');
const rateLimiter = require('../store/rateLimiter');
const connectTokens = require('../store/connectTokens');
const mediaTokens = require('../store/mediaTokens');
const suppressionList = require('../store/suppressionList');
const analyticsLog = require('../store/analyticsLog');
const idempotency = require('../store/idempotency');
const tokenStore = require('../store/tokenStore');
const sendRouter = require('./send');

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.log = { info: () => {}, warn: () => {}, error: () => {} };
    next();
  });
  app.use('/api/send', sendRouter);
  return app;
}

const VALID_BODY = {
  domain: 'known.bitrix24.com',
  accessToken: 'user-token',
  leadId: 42,
  ctaNumber: '971500000000',
};

function mockEntity({ assignedById = 5, phone = '971501234567' } = {}) {
  return {
    result: {
      ID: 42,
      NAME: 'Test Lead',
      ASSIGNED_BY_ID: assignedById,
      PHONE: phone ? [{ VALUE: phone, VALUE_TYPE: 'MOBILE' }] : [],
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  config.defaultCoverImageUrl = 'https://example.com/cover.jpg';

  vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue({
    domain: 'known.bitrix24.com',
    accessToken: 'admin',
    expiresAt: Date.now() + 3600_000,
  });
  vi.spyOn(idempotency, 'getCachedResponse').mockResolvedValue(null);
  vi.spyOn(idempotency, 'cacheResponse').mockResolvedValue();
  vi.spyOn(oncloud, 'getTemplates').mockResolvedValue([]);
  vi.spyOn(oncloud, 'sendTemplateMessage').mockResolvedValue({ status: 'success', message_id: 1, message_wamid: 'wamid.1' });
  vi.spyOn(connectTokens, 'createToken').mockResolvedValue('connect-abc');
  vi.spyOn(mediaTokens, 'createToken').mockReturnValue('media-abc');
  vi.spyOn(suppressionList, 'isSuppressed').mockReturnValue(false);
  vi.spyOn(analyticsLog, 'record').mockResolvedValue('analytics-id');
  vi.spyOn(rateLimiter, 'assertUnderLimit').mockImplementation(() => {});
  vi.spyOn(rateLimiter, 'recordSuccess').mockResolvedValue();
  vi.spyOn(bitrixClient, 'callMethodWithToken').mockImplementation(async (domain, method) => {
    if (method === 'crm.activity.add') return { result: true };
    return mockEntity();
  });
});

describe('POST /api/send', () => {
  it('rejects a request missing required fields with 400', async () => {
    const res = await request(buildApp()).post('/api/send').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/domain/);
  });

  it('rejects an unrecognized/uninstalled portal with 403', async () => {
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(undefined);
    const res = await request(buildApp()).post('/api/send').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(oncloud.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('returns 429 when the executive is already at the daily send limit', async () => {
    vi.spyOn(rateLimiter, 'assertUnderLimit').mockImplementation(() => {
      const err = new Error('Daily send limit reached');
      err.rateLimited = true;
      throw err;
    });
    const res = await request(buildApp()).post('/api/send').send(VALID_BODY);
    expect(res.status).toBe(429);
    expect(oncloud.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('skips a suppressed (opted-out) number without attempting any send', async () => {
    vi.spyOn(suppressionList, 'isSuppressed').mockReturnValue(true);
    const res = await request(buildApp()).post('/api/send').send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(false);
    expect(res.body.results[0].error).toMatch(/opted out/i);
    expect(oncloud.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'crm.lead.get'],
    [1, 'crm.lead.get'],
    [2, 'crm.deal.get'],
    [3, 'crm.contact.get'],
  ])('entityTypeId %s fetches the entity via %s', async (entityTypeId, expectedMethod) => {
    const body = entityTypeId === undefined ? VALID_BODY : { ...VALID_BODY, entityTypeId };
    const res = await request(buildApp()).post('/api/send').send(body);

    expect(res.status).toBe(200);
    expect(bitrixClient.callMethodWithToken).toHaveBeenCalledWith(
      VALID_BODY.domain,
      expectedMethod,
      { id: VALID_BODY.leadId },
      VALID_BODY.accessToken
    );
  });

  it('only calls rateLimiter.recordSuccess for items that actually succeed', async () => {
    oncloud.sendTemplateMessage
      .mockResolvedValueOnce({ status: 'success', message_id: 1, message_wamid: 'wamid.1' }) // contact_now
      .mockRejectedValueOnce(new Error('Media upload error')); // brochure file

    const res = await request(buildApp())
      .post('/api/send')
      .send({
        ...VALID_BODY,
        files: [{ id: 99, type: 'brochure', filename: 'brochure.pdf' }],
      });

    expect(res.status).toBe(200);
    const byItem = Object.fromEntries(res.body.results.map((r) => [r.item, r]));
    expect(byItem.contact_now.success).toBe(true);
    expect(byItem['brochure.pdf'].success).toBe(false);
    expect(rateLimiter.recordSuccess).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when the CRM record has no resolvable phone number', async () => {
    bitrixClient.callMethodWithToken.mockImplementation(async (domain, method) => {
      if (method === 'crm.activity.add') return { result: true };
      return mockEntity({ phone: null });
    });
    const res = await request(buildApp()).post('/api/send').send(VALID_BODY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });
});
