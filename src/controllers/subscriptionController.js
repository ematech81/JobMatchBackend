const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { PLANS } = require('../config/plans');
const { korapay } = require('../config/env');
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
 * korapayService to start a real checkout. The Subscription's own _id is
 * used as the KoraPay `reference` — the webhook below looks the row back up
 * by that same id, so nothing else needs to correlate the two. Nothing here
 * marks a subscription active — only a verified webhook (below) can do
 * that.
 */
exports.startCheckout = asyncHandler(async (req, res) => {
  const plan = PLANS[req.body.planId];
  if (!plan) return res.status(400).json({ message: 'Unknown plan' });

  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { plan: plan.id, status: 'pending', amount: plan.amount, currency: plan.currency } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const user = await User.findById(req.user.id).select('fullName');

  const checkout = await initializeCheckout({
    amount: plan.amount,
    currency: plan.currency,
    email: req.user.email,
    name: user?.fullName,
    reference: String(subscription._id)
  });

  res.json({ subscription, checkout });
});

/**
 * KoraPay POSTs here on payment events. No auth — this isn't a logged-in
 * user's request, it's KoraPay's server. Two independent checks before
 * trusting anything in the body: the ?token= query param (our own extra
 * layer) and the x-korapay-signature HMAC (KoraPay's documented mechanism,
 * signed with the account secret key — see korapayService).
 */
exports.handleWebhook = asyncHandler(async (req, res) => {
  if (korapay.webhookSecret && req.query.token !== korapay.webhookSecret) {
    return res.status(401).json({ message: 'Invalid webhook token' });
  }

  const { event, data } = req.body || {};
  const signature = req.headers['x-korapay-signature'];
  if (!data || !verifyWebhookSignature(data, signature)) {
    return res.status(401).json({ message: 'Invalid signature' });
  }

  if (event === 'charge.success' && data.status === 'success') {
    const subscription = await Subscription.findById(data.reference);
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
