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
const reconcileDelivery = require('./jobs/reconcileDelivery');

// A single unhandled rejection/exception anywhere in the app previously took the whole
// process down with no trace beyond whatever happened to be in scope's default handler -
// log it clearly so a crash is diagnosable instead of just "the app is down, no idea why".
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err);
  // Exit non-zero so the container's restart policy kicks in against a known-clean state,
  // rather than continuing to serve requests from a process that hit undefined behavior.
  process.exit(1);
});

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

const server = app.listen(config.port, () => {
  console.log(`WABA-Bitrix24 backend listening on port ${config.port}`);
  reconcileDelivery.start();
});

// Dokploy sends SIGTERM on every redeploy - without handling it, Node's default behavior
// can drop in-flight requests and interrupt file writes mid-flight (the atomic writes in
// lib/fileStore.js protect against corruption, but connections should still drain cleanly).
function gracefulShutdown(signal) {
  console.log(`[shutdown] received ${signal}, draining connections...`);
  reconcileDelivery.stop();
  server.close(() => {
    console.log('[shutdown] all connections drained, exiting.');
    process.exit(0);
  });
  // Don't hang forever if a connection never closes on its own.
  setTimeout(() => {
    console.warn('[shutdown] drain timed out, forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
