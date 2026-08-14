const axios = require('axios');
const crypto = require('crypto');
const { korapay, clientUrl } = require('../config/env');

/**
 * Real KoraPay integration (developers.korapay.com/docs/checkout-redirect,
 * .../docs/webhooks).
 *
 * No `notification_url` here on purpose: this account routes all webhooks
 * for every app through one shared router (korapay-webhook-router),
 * registered once at the KoraPay-dashboard level, not per-transaction. If
 * KoraPay also called a per-transaction notification_url directly, that
 * call would bypass the router entirely and get rejected by this app's own
 * x-router-secret check (see subscriptionController.handleWebhook) — so not
 * sending one avoids a real duplicate/broken-delivery path, not just
 * redundancy.
 */
async function initializeCheckout({ amount, currency, email, name, reference }) {
  if (!korapay.secretKey) {
    return { configured: false, checkoutUrl: null, reference };
  }

  try {
    const res = await axios.post(
      `${korapay.baseUrl}/merchant/api/v1/charges/initialize`,
      {
        amount,
        currency,
        reference,
        customer: { email, name: name || undefined },
        redirect_url: `${clientUrl}/subscribe/plans?reference=${reference}`,
        narration: 'JobMatch subscription'
      },
      {
        headers: { Authorization: `Bearer ${korapay.secretKey}` },
        timeout: 15000
      }
    );

    const { data } = res.data;
    return { configured: true, checkoutUrl: data.checkout_url, reference: data.reference };
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error('[KoraPay] Failed to initialize checkout:', detail);
    return { configured: true, checkoutUrl: null, reference, error: detail };
  }
}

/**
 * HMAC SHA256 of ONLY the `data` object (not the full webhook body), signed
 * with the account secret key — per KoraPay's documented verification
 * method. `dataObject` must be the parsed `req.body.data`, not re-serialized
 * or reordered, since the hash is sensitive to exact JSON stringification.
 */
function verifyWebhookSignature(dataObject, signatureHeader) {
  if (!korapay.secretKey || !signatureHeader) return false;
  const hash = crypto.createHmac('sha256', korapay.secretKey).update(JSON.stringify(dataObject)).digest('hex');
  return hash === signatureHeader;
}

module.exports = { initializeCheckout, verifyWebhookSignature };
