const pino = require('pino');

// Structured (JSON) logging instead of scattered console.log/console.error - gives log
// levels, machine-parseable output for whatever aggregates Dokploy's container logs, and
// (via `redact` below) a single place enforcing the PII-masking policy instead of hand-
// checking every call site for a stray phone number or access token.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.body.accessToken',
      'req.body.phone',
      '*.accessToken',
      '*.phone',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
