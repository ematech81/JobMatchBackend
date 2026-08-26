const rateLimit = require('express-rate-limit');

// Applied per-route below, not globally — a blanket limit would also throttle
// legitimate high-frequency reads (job search, matches polling). These only
// cover the endpoints that are actually attractive to automate: credential
// guessing, mass account creation, and email-bombing/enumeration via the
// password-reset and verification-resend flows.

/**
 * Login: the classic brute-force target. Keyed on IP (the default), not
 * email — rate-limiting per-email would let an attacker just rotate emails,
 * and would let an attacker lock out a *known* victim's email by deliberately
 * failing logins against it.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});

/**
 * Registration: caps mass automated account creation from a single source.
 * Looser than login since real signups are one-shot, not repeated-attempt by
 * nature — this is about throughput, not guessing.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many accounts created from this location. Please try again later.' }
});

/**
 * Forgot-password: this endpoint sends a real email and responds identically
 * whether or not the address exists (see authController) — without a limit,
 * it's both an email-bombing vector against a real address and, less
 * severely, a way to burn Brevo send volume for free by hammering random
 * addresses.
 */
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please try again later.' }
});

/**
 * Resend-verification: same email-sending concern as forgot-password, though
 * this one requires being logged in already, so the blast radius is smaller
 * (an attacker needs a valid account, not just an email address) — still
 * capped to stop a compromised or malicious account from hammering Brevo.
 */
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many verification emails requested. Please try again later.' }
});

module.exports = { loginLimiter, registerLimiter, forgotPasswordLimiter, resendVerificationLimiter };
