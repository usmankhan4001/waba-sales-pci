const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config');
const logger = require('./lib/logger');
const { DATA_DIR } = require('./lib/fileStore');
const tokenStore = require('./store/tokenStore');

const installRouter = require('./routes/install');
const sendRouter = require('./routes/send');
const connectRouter = require('./routes/connect');
const mediaRouter = require('./routes/media');
const oncloudWebhookRouter = require('./routes/oncloudWebhook');
const analyticsRouter = require('./routes/analytics');
const leadDataRouter = require('./routes/leadData');
const messageTypesRouter = require('./routes/messageTypes');
const reconcileDelivery = require('./jobs/reconcileDelivery');

// A single unhandled rejection/exception anywhere in the app previously took the whole
// process down with no trace beyond whatever happened to be in scope's default handler -
// log it clearly so a crash is diagnosable instead of just "the app is down, no idea why".
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[fatal] Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[fatal] Uncaught exception');
  // Exit non-zero so the container's restart policy kicks in against a known-clean state,
  // rather than continuing to serve requests from a process that hit undefined behavior.
  process.exit(1);
});

const app = express();

// Request-ID-correlated access logging (subsumes what morgan would give here) - every log
// line for one request, plus whatever a route handler logs via req.log, can be tied
// together via the auto-generated req id instead of guessing from timestamps alone.
app.use(pinoHttp({ logger }));

// This app is deliberately loaded in a cross-origin iframe by arbitrary Bitrix24 portals
// (that's the entire point of the CRM tab placement), and install.js's success page loads
// Bitrix's own BX24 SDK script inline - helmet's default frameguard (X-Frame-Options) and
// contentSecurityPolicy would both break that, so they're explicitly disabled here while
// keeping helmet's other protections (hidePoweredBy, noSniff, etc).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  })
);

// The frontend's page can load from either its own direct domain or the backend's
// proxied domain (see placement.bind below) - allow API calls from both defensively.
app.use(
  '/api',
  cors({
    origin: [config.frontendUrl, config.baseUrl].filter(Boolean),
  })
);

// Unconditional {ok:true} previously meant this would have reported healthy throughout the
// actual outage (tokens.json wiped by a redeploy) - now it verifies the two things that
// actually broke: the data directory is writable, and there's at least one stored Bitrix
// install auth (see tokenStore.hasAnyBitrixAuth). A fresh, never-installed deploy is also
// correctly reported unhealthy here, which is an accurate reflection of its usable state.
app.get('/health', (req, res) => {
  const checks = {};

  try {
    const probePath = path.join(DATA_DIR, `.health-write-test-${process.pid}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(probePath, 'ok');
    fs.unlinkSync(probePath);
    checks.dataDirWritable = true;
  } catch (err) {
    checks.dataDirWritable = false;
    checks.dataDirError = err.message;
  }

  checks.hasBitrixAuth = tokenStore.hasAnyBitrixAuth();

  const healthy = checks.dataDirWritable && checks.hasBitrixAuth;
  res.status(healthy ? 200 : 503).json({ ok: healthy, checks });
});

// These three are hit by parties outside our control (WhatsApp recipients tapping a CTA
// button, Meta fetching media, OnCloud's webhook) with no other throttling in front of
// them - cap by IP so a scrape/abuse burst can't hammer the process or the Bitrix/OnCloud
// APIs behind it. Token entropy already makes guessing impractical; this is defense in depth.
const connectLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
const mediaLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// The Local App's configured install handler URL is the backend's root ("/"),
// not /api/bitrix/install - mount at both so it works regardless.
app.use('/', installRouter);
app.use('/api/bitrix/install', installRouter);
app.use('/api/send', sendRouter);
app.use('/connect', connectLimiter, connectRouter);
app.use('/media', mediaLimiter, mediaRouter);
app.use('/api/oncloud/webhook', webhookLimiter, oncloudWebhookRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/lead-data', leadDataRouter);
app.use('/api/message-types', messageTypesRouter);

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
  logger.info(`WABA-Bitrix24 backend listening on port ${config.port}`);
  reconcileDelivery.start();
});

// Dokploy sends SIGTERM on every redeploy - without handling it, Node's default behavior
// can drop in-flight requests and interrupt file writes mid-flight (the atomic writes in
// lib/fileStore.js protect against corruption, but connections should still drain cleanly).
function gracefulShutdown(signal) {
  logger.info(`[shutdown] received ${signal}, draining connections...`);
  reconcileDelivery.stop();
  server.close(() => {
    logger.info('[shutdown] all connections drained, exiting.');
    process.exit(0);
  });
  // Don't hang forever if a connection never closes on its own.
  setTimeout(() => {
    logger.warn('[shutdown] drain timed out, forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
