const express = require('express');
const request = require('supertest');
const messageTypesRouter = require('./messageTypes');

function buildApp() {
  const app = express();
  app.use('/api/message-types', messageTypesRouter);
  return app;
}

describe('GET /api/message-types', () => {
  it('returns all message types with the fields the frontend needs, no internal build functions', async () => {
    const res = await request(buildApp()).get('/api/message-types');
    expect(res.status).toBe(200);
    expect(res.body.messageTypes.map((m) => m.type)).toEqual(['contact_now', 'brochure', 'video']);
    for (const m of res.body.messageTypes) {
      expect(m).toHaveProperty('templateName');
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('previewBody');
      expect(m).toHaveProperty('previewButton');
      expect(m.buildComponent).toBeUndefined();
    }
  });
});
