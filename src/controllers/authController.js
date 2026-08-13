const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, jwtSecret, {
    expiresIn: jwtExpiresIn
  }); 
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

  res.status(201).json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      preferredCountry: user.preferredCountry
    }
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
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
      resumeId: user.resumeId
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
const EDITABLE_ACCOUNT_FIELDS = ['fullName', 'preferredCountry'];

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