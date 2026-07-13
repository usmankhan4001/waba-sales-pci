/** Masks a phone number for logs, keeping only the last 4 digits (e.g. "***4023") -
 * enough to correlate a log line with a support ticket without printing PII in plaintext. */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  return `***${digits.slice(-4)}`;
}

module.exports = { maskPhone };
