const Job = require('../models/Job');
const Match = require('../models/Match');
const ParsedResume = require('../models/ParsedResume');
const User = require('../models/User');
const { computeMatchBreakdown } = require('../utils/scoring');
const { normalizeCountryToCode } = require('../utils/countryCodes');
const { ensureFreshJobsForCountry } = require('./jsearchService');
const { emitToUser } = require('./socketService');
const { sendEmail, newMatchesEmail } = require('./emailService');

// MVP cutoff, tune later. Was 40 with no recorded rationale beyond that
// comment — against real scored data (a real resume, the NG fixture pool)
// scores clustered as: one clear non-match at 1, a genuine-signal cluster at
// 15-19 (title or skill overlap, mostly generic "Developer" titles), then a
// jump to 31-32 for stronger title matches. 15 keeps the real outlier out
// while surfacing every job with actual signal — 40 was excluding all of it,
// including the two best matches in the pool (31, 32).
const MIN_SCORE_THRESHOLD = 15;

/**
 * Runs matching for a single resume against the cached jobs collection.
 * Creates/updates Match documents and emits socket notifications for new matches.
 */
async function runMatchingForResume(resume) {
  if (!resume) return [];

  const candidateJobs = await buildCandidateJobQuery(resume);

  const newMatches = [];

  for (const job of candidateJobs) {
    const breakdown = computeMatchBreakdown(resume, job);
    const { score } = breakdown;
    if (score < MIN_SCORE_THRESHOLD) continue;

    // Atomic upsert: a check-then-insert would race against concurrent runs
    // (resume save fires matching in the background, cron re-matches all users)
    // and both writers would hit the unique {userId, jobId} index with E11000.
    try {
      const result = await Match.findOneAndUpdate(
        { userId: resume.userId, jobId: job._id },
        {
          $set: {
            score,
            titleScore: breakdown.titleScore,
            skillScore: breakdown.skillScore,
            matchedSkills: breakdown.matchedSkills
          },
          $setOnInsert: { matchedAt: new Date(), notified: false }
        },
        { upsert: true, new: true, includeResultMetadata: true }
      );

      // Only a genuinely new match should be notified — score updates to an
      // already-known job must not re-notify the user.
      if (result.lastErrorObject?.upserted) {
        newMatches.push(result.value);
      }
    } catch (err) {
      // Two upserts can still collide under exact simultaneity; the other
      // writer won and the match now exists, which is the desired end state.
      if (err.code !== 11000) throw err;
    }
  }

  await notifyNewMatches(resume.userId, newMatches);
  return newMatches;
}

/**
 * Selects the candidate jobs to score for a resume.
 *
 * Preferred country is a hard filter, not a scoring signal (guide 1.3:
 * "resume's preferred country as location filter"). Title is deliberately NOT
 * filtered on — it is scored instead, since filtering would drop jobs that
 * match strongly on skills alone.
 */
async function buildCandidateJobQuery(resume) {
  // Resume countries are free text; cached jobs store ISO codes.
  const countryCode = normalizeCountryToCode(resume.preferredCountry || '');

  if (!countryCode) {
    // No location preference to filter on — cap the scan rather than scoring
    // the whole collection.
    return Job.find().sort({ fetched_at: -1 }).limit(200);
  }

  // Without this, a country the cron's fixed commonCountries list doesn't
  // cover (and nobody has browsed /jobs/search for) would score this resume
  // against zero candidates — real missed matches, not just a low count
  // somewhere in the UI. Cheap no-op if the cache is already fresh (the
  // common case for every resume after the first one in a given country).
  await ensureFreshJobsForCountry(countryCode);

  // MVP cap: scores the most recently fetched jobs in-country. Revisit when a
  // single market outgrows this (Section 3.4 flags embeddings as the v2 path).
  return Job.find({ country: countryCode }).sort({ fetched_at: -1 }).limit(500);
}

/**
 * Emits a socket.io event per new match, sends one digest email (not one
 * per match — a first scan or a big cache refresh can surface a dozen at
 * once, and a dozen separate emails just gets filtered as spam) if the user
 * has email notifications on, and marks them notified.
 *
 * Job lookups and the notified flag are batched: doing both per-match meant
 * 2N sequential round-trips, which the cron's all-users run multiplies by the
 * user count. This is a fixed number of queries regardless of match count.
 */
async function notifyNewMatches(userId, matches) {
  if (!matches.length) return;

  const jobs = await Job.find({ _id: { $in: matches.map((m) => m.jobId) } })
    .select('_id job_title employer_name')
    .lean();
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));

  const matchPayloads = matches.map((match) => {
    const job = jobById.get(String(match.jobId));
    return {
      matchId: match._id,
      jobId: job?._id,
      jobTitle: job?.job_title,
      employer: job?.employer_name,
      score: match.score
    };
  });

  for (const payload of matchPayloads) {
    emitToUser(userId.toString(), 'new_match', payload);
  }

  // Socket delivery and email are independent — a user with the app closed
  // still gets the email; a failed/unconfigured email must not stop the
  // in-app notification or the notified flag below.
  const user = await User.findById(userId).select('email fullName emailNotifications').lean();
  if (user?.emailNotifications && user.email) {
    // sendEmail never throws (see emailService.js) — fire-and-forget so a
    // slow provider response doesn't hold up the caller.
    const { subject, htmlContent } = newMatchesEmail({ fullName: user.fullName, matches: matchPayloads });
    sendEmail({ to: user.email, toName: user.fullName, subject, htmlContent });
  }

  await Match.updateMany(
    { _id: { $in: matches.map((m) => m._id) } },
    { $set: { notified: true } }
  );
}

/**
 * Runs matching across all users with a resume — used by the cron pull job
 * after fresh jobs are cached.
 */
async function runMatchingForAllUsers() {
  const resumes = await ParsedResume.find();
  const results = [];
  for (const resume of resumes) {
    const matches = await runMatchingForResume(resume);
    results.push({ userId: resume.userId, newMatches: matches.length });
  }
  return results;
}

module.exports = { runMatchingForResume, runMatchingForAllUsers };