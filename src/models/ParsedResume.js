const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema(
  {
    title: String,
    company: String,
    durationMonths: Number
  },
  { _id: false }
);

const educationSchema = new mongoose.Schema(
  {
    degree: String,
    institution: String
  },
  { _id: false }
);

const parsedResumeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: String,
    desiredTitles: [String],
    skills: [String],
    experience: [experienceSchema],
    education: [educationSchema],
    preferredCountry: String,
    // 'affinda' kept for existing documents saved before the provider
    // switch — not a live path anymore, see apilayerResumeService.
    source: { type: String, enum: ['affinda', 'apilayer', 'generated', 'custom-parser'], required: true },
    // Original upload filename (Path A only) so the UI can show which document
    // is currently active. Null for resumes built through the guided Q&A.
    originalFilename: { type: String, default: null },
    rawText: String // raw parsed text/backup, useful for re-parsing / PDF regeneration
  },
  { timestamps: true }
);

module.exports = mongoose.model('ParsedResume', parsedResumeSchema);