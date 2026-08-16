const asyncHandler = require('../utils/asyncHandler');
const Match = require('../models/Match');
const Job = require('../models/Job');
const ParsedResume = require('../models/ParsedResume');
const { runMatchingForResume } = require('../services/matchingService');
const { ensureFreshJobsForCountry } = require('../services/jsearchService');
const { normalizeCountryToCode } = require('../utils/countryCodes');

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

  // populate() silently returns jobId: null if the referenced Job document
  // no longer exists (e.g. a cache wipe) — filtered out here so the client
  // never has to guess what an "Unknown employer" card with no data means.
  // The Match itself is stale at that point too (nothing to score against
  // any more); a fresh matching run naturally replaces it.
  const usable = matches.filter((m) => m.jobId);

  res.json({ matches: usable, count: usable.length });
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


/**
 * Powers the post-onboarding "scanning" screen. Both numbers are real: a
 * fresh matching run (same as /rerun) plus the actual candidate pool it
 * scanned — the screen's animation is simulated, but nothing it displays
 * afterward is invented data.
 */
exports.getScanSummary = asyncHandler(async (req, res) => {
  const resume = await ParsedResume.findOne({ userId: req.user.id });
  if (!resume) return res.status(404).json({ message: 'No resume found' });

  // Warm the cache for this resume's country before counting/matching — a
  // brand-new user whose country nobody has searched yet (and that isn't in
  // the cron's fixed commonCountries list) would otherwise be scored against
  // an empty pool and see a real, not just cosmetic, zero.
  const countryCode = normalizeCountryToCode(resume.preferredCountry || '');
  await ensureFreshJobsForCountry(countryCode);

  await runMatchingForResume(resume);
  const matchCount = await Match.countDocuments({ userId: req.user.id });

  const scannedCount = countryCode
    ? await Job.countDocuments({ country: countryCode })
    : await Job.countDocuments();

  res.json({ scannedCount, matchCount });
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