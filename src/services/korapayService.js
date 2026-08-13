const { korapay } = require('../config/env');

/**
 * Stub — deliberately not calling the real KoraPay API yet. The user will
 * supply KORAPAY_SECRET_KEY when the checkout/webhook wiring is actually
 * built; until then this returns `configured: false` so callers can be
 * honest with the user ("checkout isn't connected yet") instead of
 * pretending a real charge was initiated.
 *
 * When wired up, this becomes a real POST to KoraPay's charge-initialization
 * endpoint using `korapay.secretKey`, returning the checkout URL/reference
 * KoraPay hands back.
 */
async function initializeCheckout({ amount, currency, email, reference }) {
  if (!korapay.secretKey) {
    return { configured: false, checkoutUrl: null, reference };
  }

  // Real integration goes here once the key is provided. Left unimplemented
  // on purpose — see subscriptionController.startCheckout.
  return { configured: false, checkoutUrl: null, reference };
}

module.exports = { initializeCheckout };
