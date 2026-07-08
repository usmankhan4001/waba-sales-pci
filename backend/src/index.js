const express = require('express');
const path = require('path');
const config = require('./config');

const installRouter = require('./routes/install');
const sendRouter = require('./routes/send');
const connectRouter = require('./routes/connect');
const oncloudWebhookRouter = require('./routes/oncloudWebhook');

const app = express();

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// The Local App's configured install handler URL is the backend's root ("/"),
// not /api/bitrix/install - mount at both so it works regardless.
app.use('/', installRouter);
app.use('/api/bitrix/install', installRouter);
app.use('/api/send', sendRouter);
app.use('/connect', connectRouter);
app.use('/api/oncloud/webhook', oncloudWebhookRouter);

app.listen(config.port, () => {
  console.log(`WABA-Bitrix24 backend listening on port ${config.port}`);
});
