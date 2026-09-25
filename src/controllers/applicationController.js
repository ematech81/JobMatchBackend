const asyncHandler = require('../utils/asyncHandler');
const findJobByEitherId = require('../utils/findJobByEitherId');
const ParsedResume = require('../models/ParsedResume');
const GeneratedApplication = require('../models/GeneratedApplication');
const { openai } = require('../config/env');
const { generateTailoredApplication } = require('../services/aiApplicationService');
const { generateResumePdf, generateCoverLetterPdf } = require('../services/resumeGeneratorService');

/**
 * POST /api/jobs/:jobId/application
 * Generates (or regenerates — upsert) a tailored summary + cover letter for
 * this job, via a real OpenAI call. `addedSkills` are the skills the user
 * picked in the skill-gap step, folded into the generation context; they
 * aren't written back to the user's actual resume here — that already
 * happens for real, separately, via PUT /resume/me (see ApplicationGenerator
 * on the frontend), so this doesn't duplicate that write.
 */
exports.generateApplication = asyncHandler(async (req, res) => {
  if (!openai.apiKey) {
    return res.status(503).json({ message: 'Application Generator is not configured yet.' });
  }

  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const resume = await ParsedResume.findOne({ userId: req.user.id });
  if (!resume) return res.status(404).json({ message: 'No resume found' });

  const addedSkills = Array.isArray(req.body.addedSkills) ? req.body.addedSkills : [];

  let generated;
  try {
    generated = await generateTailoredApplication({ resume, job, addedSkills });
  } catch (err) {
    console.error('[AI] Application generation failed:', err.response?.data || err.message);
    return res.status(502).json({ message: 'Failed to generate your application. Please try again.' });
  }

  const application = await GeneratedApplication.findOneAndUpdate(
    { userId: req.user.id, jobId: job._id },
    {
      $set: {
        summary: generated.summary,
        coverLetter: generated.coverLetter,
        addedSkills,
        model: openai.model
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json({ application });
});

exports.getApplication = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const application = await GeneratedApplication.findOne({ userId: req.user.id, jobId: job._id });
  if (!application) return res.status(404).json({ message: 'No generated application for this job yet.' });

  res.json({ application });
});

/**
 * The mockup's "Edit" button — this app doesn't model paragraph-level rich
 * editing anywhere else, so this stays scoped to what's actually AI-authored
 * here: the summary and cover letter text, not the resume's structured
 * fields (those are already editable for real on Profile).
 */
exports.updateApplication = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const updates = {};
  if (typeof req.body.summary === 'string') updates.summary = req.body.summary;
  if (typeof req.body.coverLetter === 'string') updates.coverLetter = req.body.coverLetter;
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No editable fields provided' });
  }

  const application = await GeneratedApplication.findOneAndUpdate(
    { userId: req.user.id, jobId: job._id },
    { $set: updates },
    { new: true }
  );
  if (!application) return res.status(404).json({ message: 'No generated application for this job yet.' });

  res.json({ application });
});

exports.downloadApplicationResumePdf = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const [resume, application] = await Promise.all([
    ParsedResume.findOne({ userId: req.user.id }),
    GeneratedApplication.findOne({ userId: req.user.id, jobId: job._id })
  ]);
  if (!resume) return res.status(404).json({ message: 'No resume found' });
  if (!application) return res.status(404).json({ message: 'No generated application for this job yet.' });

  // Same generic PDF renderer the base resume download uses — the tailored
  // version is just that resume with the generated summary and this
  // application's skill additions layered on top, not a different pipeline.
  const merged = {
    ...resume.toObject(),
    summary: application.summary,
    skills: [...new Set([...(resume.skills || []), ...(application.addedSkills || [])])]
  };

  const pdfBuffer = await generateResumePdf(merged);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${(resume.fullName || 'resume').replace(/\s+/g, '_')}_tailored.pdf"`);
  res.send(pdfBuffer);
});

exports.downloadApplicationCoverLetterPdf = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const [resume, application] = await Promise.all([
    ParsedResume.findOne({ userId: req.user.id }),
    GeneratedApplication.findOne({ userId: req.user.id, jobId: job._id })
  ]);
  if (!application) return res.status(404).json({ message: 'No generated application for this job yet.' });

  const pdfBuffer = await generateCoverLetterPdf(application.coverLetter, {
    fullName: resume?.fullName,
    jobTitle: job.job_title,
    employerName: job.employer_name
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="cover_letter.pdf"');
  res.send(pdfBuffer);
});
