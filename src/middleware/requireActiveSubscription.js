const asyncHandler = require('../utils/asyncHandler');
const Subscription = require('../models/Subscription');
const { subscriptionGateEnabled } = require('../config/env');

/**
 * Gate for "has paid" — must run after `auth` (and after requireResume on
 * routes that need both).
 *
 * SUBSCRIPTION_GATE_ENABLED=false (see config/env.js) bypasses this
 * entirely — a deliberate testing-period switch, not a bug. Re-enable
 * before real launch.
 */
module.exports = asyncHandler(async (req, res, next) => {
  if (!subscriptionGateEnabled) return next();

  const subscription = await Subscription.findOne({ userId: req.user.id }).select('status');
  if (!subscription || subscription.status !== 'active') {
    return res.status(403).json({
      message: 'Subscribe to unlock job listings.',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  next();
});
