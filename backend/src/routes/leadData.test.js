const express = require('express');
const request = require('supertest');
const bitrixClient = require('../bitrix/client');
const tokenStore = require('../store/tokenStore');
const leadDataRouter = require('./leadData');

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.log = { info: () => {}, warn: () => {}, error: () => {} };
    next();
  });
  app.use('/api/lead-data', leadDataRouter);
  return app;
}

const VALID_BODY = { domain: 'known.bitrix24.com', accessToken: 'tok', leadId: 1 };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue({ domain: 'known.bitrix24.com' });
});

describe('POST /api/lead-data', () => {
  it('rejects missing required fields with 400', async () => {
    const res = await request(buildApp()).post('/api/lead-data').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized portal with 403', async () => {
    vi.spyOn(tokenStore, 'getBitrixAuth').mockReturnValue(undefined);
    const res = await request(buildApp()).post('/api/lead-data').send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('returns 404 when the CRM record does not exist', async () => {
    vi.spyOn(bitrixClient, 'callMethodWithToken').mockResolvedValue({ result: null });
    const res = await request(buildApp()).post('/api/lead-data').send(VALID_BODY);
    expect(res.status).toBe(404);
  });

  it('returns the resolved name and phone for an existing record', async () => {
    vi.spyOn(bitrixClient, 'callMethodWithToken').mockResolvedValue({
      result: { NAME: 'Jane', ASSIGNED_BY_ID: 9, PHONE: [{ VALUE: '971501234567', VALUE_TYPE: 'MOBILE' }] },
    });
    const res = await request(buildApp()).post('/api/lead-data').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ leadName: 'Jane', leadPhone: '971501234567', responsibleId: 9 });
  });
});
