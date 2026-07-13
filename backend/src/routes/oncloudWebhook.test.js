const express = require('express');
const request = require('supertest');
const config = require('../config');
const suppressionList = require('../store/suppressionList');
const webhookRouter = require('./oncloudWebhook');

function buildApp() {
  const app = express();
  // Route handlers call req.log.* (wired via pino-http in the real app) - stub it here
  // so tests don't need a real logger dependency to exercise the route logic.
  app.use((req, res, next) => {
    req.log = { info: () => {}, warn: () => {}, error: () => {} };
    next();
  });
  app.use('/api/oncloud/webhook', webhookRouter);
  return app;
}

beforeEach(() => {
  vi.restoreAllMocks();
  config.oncloudWebhookSecret = 'test-secret';
});

describe('POST /api/oncloud/webhook', () => {
  it('rejects a request with no secret configured', async () => {
    config.oncloudWebhookSecret = '';
    const res = await request(buildApp()).post('/api/oncloud/webhook').send({});
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const res = await request(buildApp()).post('/api/oncloud/webhook?secret=wrong').send({});
    expect(res.status).toBe(401);
  });

  it('accepts a request with the correct secret and does nothing for a non-opt-out message', async () => {
    const suppressSpy = vi.spyOn(suppressionList, 'suppress').mockResolvedValue();
    const res = await request(buildApp())
      .post('/api/oncloud/webhook?secret=test-secret')
      .send({ from: '971501234567', message: 'hi there' });

    expect(res.status).toBe(200);
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it('suppresses the sender when the message is STOP/unsubscribe', async () => {
    const suppressSpy = vi.spyOn(suppressionList, 'suppress').mockResolvedValue();
    const res = await request(buildApp())
      .post('/api/oncloud/webhook?secret=test-secret')
      .send({ from: '971501234567', message: 'STOP' });

    expect(res.status).toBe(200);
    expect(suppressSpy).toHaveBeenCalledWith('971501234567', expect.stringMatching(/opt-out|unsubscribe/i));
  });

  it('does not crash on a malformed (array) body and still acks 200', async () => {
    const suppressSpy = vi.spyOn(suppressionList, 'suppress').mockResolvedValue();
    const res = await request(buildApp())
      .post('/api/oncloud/webhook?secret=test-secret')
      .send([1, 2, 3]);

    expect(res.status).toBe(200);
    expect(suppressSpy).not.toHaveBeenCalled();
  });

  it('still acks 200 even if suppressing fails internally', async () => {
    vi.spyOn(suppressionList, 'suppress').mockRejectedValue(new Error('disk full'));
    const res = await request(buildApp())
      .post('/api/oncloud/webhook?secret=test-secret')
      .send({ from: '971501234567', message: 'unsubscribe' });

    expect(res.status).toBe(200);
  });
});
