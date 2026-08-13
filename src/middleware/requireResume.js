const asyncHandler = require('../utils/asyncHandler');
const ParsedResume = require('../models/ParsedResume');

/**
 * Gate for "onboarding complete" — must run after `auth`. Composes with
 * requireActiveSubscription on routes that need both (job data); used alone
 * on routes that only need a resume to exist (the subscribe/scan step,
 * which runs before a subscription can exist at all).
 */
module.exports = asyncHandler(async (req, res, next) => {
  const resume = await ParsedResume.findOne({ userId: req.user.id }).select('_id');
  if (!resume) {
    return res.status(403).json({
      message: 'Complete onboarding (upload or build a resume) before accessing this.',
      code: 'ONBOARDING_REQUIRED'
    });
  }
  next();
});
