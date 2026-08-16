const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional — a Google-only account has no password at all. login() must
    // reject password sign-in for these before ever reaching bcrypt.compare
    // (comparing against null throws, not just fails).
    passwordHash: { type: String, default: null },
    // Google's stable per-account id (the ID token's `sub` claim) — set the
    // moment a Google sign-in is linked, whether that's a brand new account
    // or an existing password account matched by email (see authController).
    //
    // No `default` here on purpose — a sparse unique index only excludes
    // documents where the field is genuinely ABSENT, not documents where
    // it's present with value `null`. `default: null` was writing an
    // explicit null onto every plain signup, so the *second* one always
    // collided with the first on the shared null slot (E11000). Omitting
    // the field entirely for non-Google accounts is what actually makes
    // sparse+unique work as intended.
    googleId: { type: String, unique: true, sparse: true },
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
    emailVerificationTokenExpires: { type: Date, default: null, select: false },

    // Same hashed-token pattern as email verification, for the same reason —
    // a DB read alone must not be enough to reset someone else's password.
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetTokenExpires: { type: Date, default: null, select: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);