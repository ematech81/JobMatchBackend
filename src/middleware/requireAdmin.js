const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

/**
 * Gate for the admin dashboard's API — must run after `auth`. Looks the role
 * up fresh from the DB rather than trusting a JWT claim (the token only ever
 * encodes {id, email}), so revoking admin access takes effect on the very
 * next request instead of waiting out the token's 7-day expiry.
 */
module.exports = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('role');
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }
  next();
});
