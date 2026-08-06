const asyncHandler = require('../utils/asyncHandler');
const Match = require('../models/Match');
const Job = require('../models/Job');
const ParsedResume = require('../models/ParsedResume');
const { runMatchingForResume } = require('../services/matchingService');

/**
 * GET /api/matches?sort=score|recent&limit=N
 *
 * The dashboard renders the same collection two ways — highest scoring first
 * for the match grid, most recent first for the live activity feed — so the
 * ordering is a query param rather than two near-identical endpoints.
 */
exports.getMyMatches = asyncHandler(async (req, res) => {
  const { sort = 'score', limit } = req.query;

  const sortSpec = sort === 'recent' ? { matchedAt: -1 } : { score: -1 };

  // Cap the page size so a client cannot ask for an unbounded populate.
  const parsedLimit = Math.min(Number(limit) || 50, 100);

  const matches = await Match.find({ userId: req.user.id })
    .sort(sortSpec)
    .limit(parsedLimit)
    .populate('jobId');

  res.json({ matches, count: matches.length });
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

  res.json({
    match: {
      score: match.score,
      titleScore: match.titleScore,
      skillScore: match.skillScore,
      matchedSkills: match.matchedSkills,
      matchedAt: match.matchedAt
    }
  });
});