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
    source: { type: String, enum: ['affinda', 'generated', 'custom-parser'], required: true },
    rawText: String // raw parsed text/backup, useful for re-parsing / PDF regeneration
  },
  {
    title: String,
    company: String,
    durationMonths: Number,
    description: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('ParsedResume', parsedResumeSchema);