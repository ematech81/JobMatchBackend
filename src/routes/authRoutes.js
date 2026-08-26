const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter
} = require('../middleware/rateLimiters');
const {
  register,
  login,
  googleAuth,
  getMe,
  updateMe,
  changePassword,
  deleteAccount,
  exportMyData,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
// No auth — this IS the auth step (verifies the Google ID token itself).
router.post('/google', googleAuth);
router.get('/me', auth, getMe);
router.patch('/me', auth, updateMe);
router.patch('/me/password', auth, changePassword);
router.delete('/me', auth, deleteAccount);
router.get('/me/export', auth, exportMyData);
// No auth — the token is the proof, not the session (see verifyEmail).
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', auth, resendVerificationLimiter, resendVerificationEmail);
// No auth on either — you're logged out precisely because you forgot your
// password; the reset token itself is what proves it's really you. Same
// limiter on both: forgot-password sends an email per request, and
// reset-password is the token-guessing surface for it.
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', forgotPasswordLimiter, resetPassword);

module.exports = router;