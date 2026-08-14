const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { PLANS } = require('../config/plans');
const { korapay, routerForwardSecret } = require('../config/env');
const { initializeCheckout, verifyWebhookSignature } = require('../services/korapayService');

exports.getPlans = asyncHandler(async (req, res) => {
  res.json({ plans: Object.values(PLANS) });
});

exports.getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ userId: req.user.id });
  res.json({ subscription });
});

/**
 * Records the user's plan choice as a pending Subscription and asks
 * korapayService to start a real checkout. The KoraPay `reference` is a
 * fresh `JMT-{uuid}` value, not the Subscription's own _id — the shared
 * korapay-webhook-router (one router in front of KoraPay for all of this
 * account's apps) routes incoming webhooks by matching the prefix before
 * the first '-' in the reference against a `ROUTE_<PREFIX>` env var, so the
 * reference has to carry that prefix. Stored as `checkoutReference` so the
 * webhook below can look the row back up by it. Nothing here marks a
 * subscription active — only a verified webhook (below) can do that.
 */
exports.startCheckout = asyncHandler(async (req, res) => {
  const plan = PLANS[req.body.planId];
  if (!plan) return res.status(400).json({ message: 'Unknown plan' });

  const checkoutReference = `JMT-${crypto.randomUUID()}`;

  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { plan: plan.id, status: 'pending', amount: plan.amount, currency: plan.currency, checkoutReference } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const user = await User.findById(req.user.id).select('fullName');

  const checkout = await initializeCheckout({
    amount: plan.amount,
    currency: plan.currency,
    email: req.user.email,
    name: user?.fullName,
    reference: checkoutReference
  });

  res.json({ subscription, checkout });
});

/**
 * KoraPay POSTs here on payment events — by way of the shared router, not
 * directly (see startCheckout). Two independent checks before trusting
 * anything in the body:
 *  - x-router-secret: proves this request actually came through the router,
 *    not a direct spoofed call to this endpoint. Optional (skipped if
 *    routerForwardSecret isn't configured), since the signature check below
 *    is the authoritative one either way.
 *  - x-korapay-signature: KoraPay's documented HMAC, signed with the account
 *    secret key — see korapayService. This is the real proof of origin; the
 *    router forwards it byte-for-byte, so verification works unmodified.
 */
exports.handleWebhook = asyncHandler(async (req, res) => {
  if (routerForwardSecret && req.headers['x-router-secret'] !== routerForwardSecret) {
    return res.status(401).json({ message: 'Invalid router secret' });
  }

  const { event, data } = req.body || {};
  const signature = req.headers['x-korapay-signature'];
  if (!data || !verifyWebhookSignature(data, signature)) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  if (event === 'charge.success' && data.status === 'success') {
    const subscription = await Subscription.findOne({ checkoutReference: data.reference });
    if (subscription) {
      const plan = PLANS[subscription.plan];
      const periodDays = plan?.trialDays || 30;

      subscription.status = 'active';
      subscription.koraPayReference = data.payment_reference || data.reference;
      subscription.startedAt = new Date();
      subscription.currentPeriodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);
      await subscription.save();
    }
  }

  res.status(200).json({ received: true });
});
