const axios = require('axios');
const crypto = require('crypto');
const { korapay, apiPublicUrl, clientUrl } = require('../config/env');

/**
 * Real KoraPay integration (developers.korapay.com/docs/checkout-redirect,
 * .../docs/webhooks). Two things worth knowing:
 *
 * - The webhook query token (?token=) is an extra layer on top of KoraPay's
 *   own documented signature check, not a replacement for it — their docs
 *   are explicit that signature verification uses the account secret key,
 *   not a separate webhook secret, so verifyWebhookSignature below signs
 *   with `korapay.secretKey` regardless of whether a webhookSecret is set.
 * - notification_url must be a URL KoraPay's servers can actually reach.
 *   `apiPublicUrl` defaults to localhost, which does not work for real
 *   webhook delivery without a tunnel (ngrok, etc.) — see env.js.
 */
async function initializeCheckout({ amount, currency, email, name, reference }) {
  if (!korapay.secretKey) {
    return { configured: false, checkoutUrl: null, reference };
  }

  const notificationUrl = korapay.webhookSecret
    ? `${apiPublicUrl}/api/subscription/webhook?token=${korapay.webhookSecret}`
    : `${apiPublicUrl}/api/subscription/webhook`;

  try {
    const res = await axios.post(
      `${korapay.baseUrl}/merchant/api/v1/charges/initialize`,
      {
        amount,
        currency,
        reference,
        customer: { email, name: name || undefined },
        redirect_url: `${clientUrl}/subscribe/plans?reference=${reference}`,
        notification_url: notificationUrl,
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
