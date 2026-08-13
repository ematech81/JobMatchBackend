const asyncHandler = require('../utils/asyncHandler');
const Subscription = require('../models/Subscription');

/**
 * Gate for "has paid" — must run after `auth` (and after requireResume on
 * routes that need both). Nothing can currently reach `status: 'active'`
 * (see korapayService — checkout is stubbed), so until that's wired up this
 * blocks everyone, which is the correct behavior: no real payment means no
 * real access, not a soft/best-effort gate.
 */
module.exports = asyncHandler(async (req, res, next) => {
  const subscription = await Subscription.findOne({ userId: req.user.id }).select('status');
  if (!subscription || subscription.status !== 'active') {
    return res.status(403).json({
      message: 'Subscribe to unlock job listings.',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  }
  next();
});
