const oncloud = require('../oncloud/client');
const analyticsLog = require('../store/analyticsLog');
const { maskPhone } = require('../lib/redact');

// Only chase entries from the recent past - older unresolved ones are either already
// stale (Meta will never report back further status) or long past mattering operationally.
const RECONCILE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * OnCloud's sendTemplateMessage response is just "queued", not delivery truth - we
 * confirmed this directly (a "success" response with a real wamid was later shown by
 * getMessages to have failed with e.g. "This message was not delivered to maintain
 * healthy ecosystem engagement" or "Media upload error"). This job polls getMessages
 * periodically for recent, still-unresolved sends and patches analyticsLog with the real
 * outcome, so a "success" in the UI/logs isn't taken at face value.
 */
async function reconcileOnce() {
  const entries = analyticsLog.readAll();
  const cutoff = Date.now() - RECONCILE_WINDOW_MS;
  const pending = entries.filter(
    (e) => e.deliveryStatus === 'unknown' && e.oncloudWamid && new Date(e.timestamp).getTime() >= cutoff
  );
  if (pending.length === 0) return;

  const byPhone = new Map();
  for (const e of pending) {
    if (!byPhone.has(e.phone)) byPhone.set(e.phone, []);
    byPhone.get(e.phone).push(e);
  }

  for (const [phone, phoneEntries] of byPhone) {
    try {
      const contactId = await oncloud.findContactIdByPhone(phone);
      if (!contactId) continue;
      const messages = await oncloud.getMessagesForContact(contactId);
      const byWamid = new Map(messages.map((m) => [m.fb_message_id, m]));
      for (const entry of phoneEntries) {
        const match = byWamid.get(entry.oncloudWamid);
        if (!match) continue;
        const delivered = !match.error;
        await analyticsLog.updateDeliveryStatus(
          { oncloudWamid: entry.oncloudWamid },
          { deliveryStatus: delivered ? 'delivered' : 'failed', deliveryError: match.error || null }
        );
      }
    } catch (err) {
      console.error(`[reconcileDelivery] failed for ${maskPhone(phone)}:`, err.message);
    }
  }
}

let intervalHandle = null;

function start(intervalMs = 5 * 60_000) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    reconcileOnce().catch((err) => console.error('[reconcileDelivery] cycle failed:', err.message));
  }, intervalMs);
  // Don't hold the process open just for this timer - shutdown should be able to proceed.
  intervalHandle.unref?.();
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { reconcileOnce, start, stop };
