const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, default: null },
    resumeSource: { type: String, enum: ['uploaded', 'generated', null], default: null },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParsedResume', default: null },
    preferredCountry: { type: String, default: null },
    savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
    // Opt-out, not opt-in — new-match alerts are the core reason to have an
    // account here, so defaulting to on matches how every other job-alert
    // product in this space behaves. Toggleable from Account Settings.
    emailNotifications: { type: Boolean, default: true },

    // Soft-gate, not hard-gate: an unverified user can fully use the app
    // (onboarding, subscribing, matches) — this only drives a dismissable
    // reminder. Token is stored hashed (never the raw value that goes in the
    // email link) so a DB read alone can't be used to verify someone else's
    // address, same reasoning as passwordHash.
    emailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationTokenExpires: { type: Date, default: null, select: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);