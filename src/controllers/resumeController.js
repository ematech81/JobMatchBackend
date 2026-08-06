const User = require('../models/User');
const ParsedResume = require('../models/ParsedResume');
const asyncHandler = require('../utils/asyncHandler');
const { parseResumeWithAffinda } = require('../services/affindaService');
const {
  buildResumeFromAnswers,
  generateResumePdf
} = require('../services/resumeGeneratorService');
const { runMatchingForResume } = require('../services/matchingService');
const { computeResumeStrength, totalExperienceMonths } = require('../utils/resumeStrength');

/**
 * Path A: Upload existing resume (PDF/DOCX) -> Affinda parse -> canonical ParsedResume
 */
exports.uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  let canonical;
  try {
    canonical = await parseResumeWithAffinda(req.file.buffer, req.file.originalname);
  } catch (err) {
    console.error('[Affinda] parse failed, needs fallback parser:', err.message);
    return res.status(502).json({
      message: 'Resume parsing service unavailable. Please try again later or use the guided builder.'
    });
  }

  const resume = await upsertResumeForUser(req.user.id, {
    ...canonical,
    originalFilename: req.file.originalname
  });

  await User.findByIdAndUpdate(req.user.id, {
    resumeSource: 'uploaded',
    resumeId: resume._id,
    preferredCountry: resume.preferredCountry || undefined
  });

  // Fire-and-forget matching against current cache
  runMatchingForResume(resume).catch((e) => console.error('[Match] error:', e.message));

  res.status(201).json({ resume });
});

/**
 * Path B: Guided resume builder Q&A -> canonical ParsedResume
 */
exports.generateResume = asyncHandler(async (req, res) => {
  const answers = req.body;

  if (!answers.fullName || !answers.preferredCountry) {
    return res.status(400).json({ message: 'fullName and preferredCountry are required' });
  }

  const canonical = buildResumeFromAnswers(answers);
  const resume = await upsertResumeForUser(req.user.id, canonical);

  await User.findByIdAndUpdate(req.user.id, {
    resumeSource: 'generated',
    resumeId: resume._id,
    preferredCountry: resume.preferredCountry
  });

  runMatchingForResume(resume).catch((e) => console.error('[Match] error:', e.message));

  res.status(201).json({ resume });
});

exports.getMyResume = asyncHandler(async (req, res) => {
  const resume = await ParsedResume.findOne({ userId: req.user.id });
  if (!resume) return res.status(404).json({ message: 'No resume found' });

  // Derived fields travel with the resume so the dashboard does not have to
  // reimplement the completeness rules the backend already owns.
  res.json({
    resume,
    strength: computeResumeStrength(resume),
    totalExperienceMonths: totalExperienceMonths(resume)
  });
});

// Client-editable resume fields — `userId` and `source` are server-owned.
const EDITABLE_RESUME_FIELDS = [
  'fullName',
  'desiredTitles',
  'skills',
  'experience',
  'education',
  'preferredCountry'
];

exports.updateMyResume = asyncHandler(async (req, res) => {
  const updates = {};
  for (const field of EDITABLE_RESUME_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No editable fields provided' });
  }

  const resume = await ParsedResume.findOneAndUpdate(
    { userId: req.user.id },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!resume) return res.status(404).json({ message: 'No resume found' });

  runMatchingForResume(resume).catch((e) => console.error('[Match] error:', e.message));
  res.json({ resume });
});

/**
 * Upsell feature: download generated/parsed resume as PDF (Section 5, step 8)
 */
exports.downloadResumePdf = asyncHandler(async (req, res) => {
  const resume = await ParsedResume.findOne({ userId: req.user.id });
  if (!resume) return res.status(404).json({ message: 'No resume found' });

  const pdfBuffer = await generateResumePdf(resume);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="resume-${req.user.id}.pdf"`
  });
  res.send(pdfBuffer);
});

async function upsertResumeForUser(userId, canonical) {
  return ParsedResume.findOneAndUpdate(
    { userId },
    { $set: { ...canonical, userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}