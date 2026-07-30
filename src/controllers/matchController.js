const asyncHandler = require('../utils/asyncHandler');
const Match = require('../models/Match');
const Job = require('../models/Job');
const ParsedResume = require('../models/ParsedResume');
const { runMatchingForResume } = require('../services/matchingService');

exports.getMyMatches = asyncHandler(async (req, res) => {
  const matches = await Match.find({ userId: req.user.id })
    .sort({ score: -1 })
    .populate('jobId');

  res.json({ matches });
});

/**
 * Manually trigger a re-match run for the current user (useful right after
 * resume upload/update, in addition to the automatic fire-and-forget call).
 */
exports.rerunMyMatches = asyncHandler(async (req, res) => {
  const resume = await ParsedResume.findOne({ userId: req.user.id });
  if (!resume) return res.status(404).json({ message: 'No resume found' });

  const matches = await runMatchingForResume(resume);
  res.json({ newMatchesCount: matches.length });
});


exports.getMatchForJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ job_id: req.params.jobId });
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const match = await Match.findOne({ userId: req.user.id, jobId: job._id });
  if (!match) return res.json({ match: null });

  res.json({ match: { score: match.score, matchedAt: match.matchedAt } });
});