const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, default: null },
    resumeSource: { type: String, enum: ['uploaded', 'generated', null], default: null },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParsedResume', default: null },
    preferredCountry: { type: String, default: null },
    savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);