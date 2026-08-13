const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
  deleteAccount,
  exportMyData,
  verifyEmail,
  resendVerificationEmail
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, getMe);
router.patch('/me', auth, updateMe);
router.patch('/me/password', auth, changePassword);
router.delete('/me', auth, deleteAccount);
router.get('/me/export', auth, exportMyData);
// No auth — the token is the proof, not the session (see verifyEmail).
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', auth, resendVerificationEmail);

module.exports = router;