const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const ParsedResume = require('../models/ParsedResume');
const Match = require('../models/Match');
const Subscription = require('../models/Subscription');
const { jwtSecret, jwtExpiresIn, google } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail, verificationEmail, passwordResetEmail } = require('../services/emailService');

const googleClient = new OAuth2Client(google.clientId);

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, jwtSecret, {
    expiresIn: jwtExpiresIn
  });
}

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The raw token goes in the email link; only its hash is ever persisted —
 * same reasoning as passwordHash, so a DB read alone can't be used to
 * verify someone else's address. Saves the user doc (the token fields),
 * then fires the send without awaiting it — a slow/failed email provider
 * must never hold up registration or a resend request, and this is a soft
 * nudge, not a blocking step, so there's nothing downstream waiting on it.
 */
async function issueAndSendVerificationEmail(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.emailVerificationTokenExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
  await user.save();

  const { subject, htmlContent } = verificationEmail({ fullName: user.fullName, verifyToken: rawToken });
  sendEmail({ to: user.email, toName: user.fullName, subject, htmlContent });
}

exports.register = asyncHandler(async (req, res) => {
  const { email, password, fullName, preferredCountry } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    fullName: fullName?.trim() || null,
    preferredCountry: preferredCountry || null
  });

  const token = signToken(user);

  // A failure here (provider down, bad key) must not fail registration —
  // the account already exists at this point. Resend covers the gap.
  try {
    await issueAndSendVerificationEmail(user);
  } catch (err) {
    console.error('[Auth] Failed to issue verification email:', err.message);
  }

  res.status(201).json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      preferredCountry: user.preferredCountry,
      emailVerified: user.emailVerified
    }
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // A Google-only account has no passwordHash at all — bcrypt.compare
  // against null throws rather than just failing, so this must be checked
  // before ever reaching it, not left to fall through.
  if (!user.passwordHash) {
    return res.status(401).json({ message: 'This account uses Google Sign-In. Use the Google button to sign in.' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken(user);

  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      preferredCountry: user.preferredCountry,
      resumeSource: user.resumeSource,
      resumeId: user.resumeId,
      emailVerified: user.emailVerified
    }
  });
});

/**
 * Verifies a Google ID token (from the frontend's Google Identity Services
 * button) and either logs in an existing linked account, links Google to an
 * existing password account with the same email (auto-link — Google has
 * already verified that email, same trust level as our own verification
 * flow), or creates a brand new account. Either way it ends in the same
 * signToken()/response shape as register/login, so nothing downstream
 * (RequireAuth, onboarding, etc.) needs to know which path was taken.
 */
exports.googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ message: 'idToken is required' });
  if (!google.clientId) {
    return res.status(503).json({ message: 'Google Sign-In is not configured yet.' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: google.clientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: 'Invalid Google token' });
  }

  const { sub: googleId, email, name, email_verified: googleEmailVerified } = payload;
  if (!email) return res.status(401).json({ message: 'Google account has no email' });

  let user = await User.findOne({ googleId });

  if (!user) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Existing password account, same email — link rather than duplicate.
      user.googleId = googleId;
      if (googleEmailVerified) user.emailVerified = true;
      await user.save();
    } else {
      user = await User.create({
        email: email.toLowerCase(),
        googleId,
        fullName: name || null,
        emailVerified: Boolean(googleEmailVerified)
      });
    }
  }

  const token = signToken(user);

  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      preferredCountry: user.preferredCountry,
      resumeSource: user.resumeSource,
      resumeId: user.resumeId,
      emailVerified: user.emailVerified
    }
  });
});

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
});

// Account-level fields only — email is deliberately excluded (changing it
// has real security implications like re-verification that this endpoint
// doesn't handle) and there's no phone field on the User model yet.
const EDITABLE_ACCOUNT_FIELDS = ['fullName', 'preferredCountry', 'emailNotifications'];

exports.updateMe = asyncHandler(async (req, res) => {
  const updates = {};
  for (const field of EDITABLE_ACCOUNT_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No editable fields provided' });
  }
  if (updates.fullName !== null) updates.fullName = updates.fullName?.trim() || null;

  const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, {
    new: true,
    runValidators: true
  }).select('-passwordHash');

  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
});

const MIN_PASSWORD_LENGTH = 8;

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ message: 'Password updated' });
});

/**
 * Permanent, cascading account deletion — everything the user actually
 * owns, not just the User document itself. Requires the current password as
 * confirmation (same bar as changing it), since this can't be undone.
 *
 * The JWT itself isn't revoked (no session store exists to revoke it from —
 * see AuthContext's cookie comment); a leftover token would still pass
 * signature verification. What actually stops it from being useful is every
 * handler already 404ing when `User.findById` comes back null. The client
 * still clears its token/cookie immediately on success, same as a normal
 * sign-out.
 */
exports.deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ message: 'Password is required to delete your account' });
  }

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Incorrect password' });
  }

  await Promise.all([
    ParsedResume.deleteMany({ userId: user._id }),
    Match.deleteMany({ userId: user._id }),
    Subscription.deleteMany({ userId: user._id })
  ]);
  await User.deleteOne({ _id: user._id });

  res.json({ message: 'Account deleted' });
});

/**
 * A JSON download of everything the account actually owns — the practical
 * "export my data" shape given there's no separate document-generation
 * pipeline for this (resume PDF export already exists and covers that
 * specific document; this is the broader account+matches+subscription
 * picture, which is naturally structured data, not prose).
 */
exports.exportMyData = asyncHandler(async (req, res) => {
  const [user, resume, matches, subscription] = await Promise.all([
    User.findById(req.user.id).select('-passwordHash').lean(),
    ParsedResume.findOne({ userId: req.user.id }).lean(),
    Match.find({ userId: req.user.id }).populate('jobId', 'job_title employer_name apply_link').lean(),
    Subscription.findOne({ userId: req.user.id }).lean()
  ]);

  if (!user) return res.status(404).json({ message: 'User not found' });

  const exportData = {
    exportedAt: new Date().toISOString(),
    account: user,
    resume: resume || null,
    subscription: subscription || null,
    matches: matches.map((m) => ({
      jobTitle: m.jobId?.job_title,
      employer: m.jobId?.employer_name,
      applyLink: m.jobId?.apply_link,
      score: m.score,
      matchedSkills: m.matchedSkills,
      matchedAt: m.matchedAt
    }))
  };

  res.setHeader('Content-Disposition', 'attachment; filename="jobmatch-data-export.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportData, null, 2));
});

/**
 * No auth required — the token itself is the proof of mailbox ownership,
 * independent of whatever session state the browser that clicked the link
 * happens to be in (could be a different device than the one that
 * registered). select('+...') is needed since those fields are `select:
 * false` on the schema.
 */
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'Verification token is required' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationTokenExpires: { $gt: new Date() }
  }).select('+emailVerificationTokenHash +emailVerificationTokenExpires');

  if (!user) {
    return res.status(400).json({ message: 'This verification link is invalid or has expired.' });
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = null;
  user.emailVerificationTokenExpires = null;
  await user.save();

  res.json({ message: 'Email verified' });
});

exports.resendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (user.emailVerified) {
    return res.json({ message: 'Your email is already verified' });
  }

  await issueAndSendVerificationEmail(user);
  res.json({ message: 'Verification email sent' });
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Always responds the same way whether or not the email exists — a
 * different response for "no account" vs "email sent" would let anyone
 * enumerate registered emails by trying them here. No auth (you're logged
 * out precisely because you forgot your password).
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();

    const { subject, htmlContent } = passwordResetEmail({ fullName: user.fullName, resetToken: rawToken });
    sendEmail({ to: user.email, toName: user.fullName, subject, htmlContent }).catch((err) =>
      console.error('[Auth] Failed to send password reset email:', err.message)
    );
  }

  res.json({ message: 'If that email is registered, a reset link is on its way.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpires: { $gt: new Date() }
  }).select('+passwordResetTokenHash +passwordResetTokenExpires');

  if (!user) {
    return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetTokenExpires = null;
  await user.save();

  res.json({ message: 'Password reset' });
});