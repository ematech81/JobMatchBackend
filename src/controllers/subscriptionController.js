const asyncHandler = require('../utils/asyncHandler');
const Subscription = require('../models/Subscription');
const { PLANS } = require('../config/plans');
const { initializeCheckout } = require('../services/korapayService');

exports.getPlans = asyncHandler(async (req, res) => {
  res.json({ plans: Object.values(PLANS) });
});

exports.getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({ userId: req.user.id });
  res.json({ subscription });
});

/**
 * Records the user's plan choice as a pending Subscription and asks
 * korapayService to start a real checkout. Real payment isn't wired up yet
 * (see korapayService), so `checkout.configured` comes back false and the
 * client shows an honest "not connected yet" state instead of a fake
 * checkout redirect. Nothing here marks a subscription active — only a
 * confirmed KoraPay payment (webhook, not built yet) can do that.
 */
exports.startCheckout = asyncHandler(async (req, res) => {
  const plan = PLANS[req.body.planId];
  if (!plan) return res.status(400).json({ message: 'Unknown plan' });

  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { plan: plan.id, status: 'pending', amount: plan.amount, currency: plan.currency } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const checkout = await initializeCheckout({
    amount: plan.amount,
    currency: plan.currency,
    email: req.user.email,
    reference: String(subscription._id)
  });

  res.json({ subscription, checkout });
});
