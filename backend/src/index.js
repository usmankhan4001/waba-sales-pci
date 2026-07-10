const express = require('express');
const path = require('path');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config');

const installRouter = require('./routes/install');
const sendRouter = require('./routes/send');
const connectRouter = require('./routes/connect');
const mediaRouter = require('./routes/media');
const oncloudWebhookRouter = require('./routes/oncloudWebhook');
const analyticsRouter = require('./routes/analytics');

const app = express();

// The frontend's page can load from either its own direct domain or the backend's
// proxied domain (see placement.bind below) - allow API calls from both defensively.
app.use(
  '/api',
  cors({
    origin: [config.frontendUrl, config.baseUrl].filter(Boolean),
  })
);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// The Local App's configured install handler URL is the backend's root ("/"),
// not /api/bitrix/install - mount at both so it works regardless.
app.use('/', installRouter);
app.use('/api/bitrix/install', installRouter);
app.use('/api/send', sendRouter);
app.use('/connect', connectRouter);
app.use('/media', mediaRouter);
app.use('/api/oncloud/webhook', oncloudWebhookRouter);
app.use('/api/analytics', analyticsRouter);

// Bitrix24 requires placement.bind's HANDLER to be on the same domain as the app's
// registered handler URL - so the frontend (a separate Dokploy app/domain) is proxied
// through here for everything not otherwise handled above, making it all same-origin.
if (config.frontendUrl) {
  app.use(
    '/',
    createProxyMiddleware({
      target: config.frontendUrl,
      changeOrigin: true,
    })
  );
}

app.listen(config.port, () => {
  console.log(`WABA-Bitrix24 backend listening on port ${config.port}`);
});
