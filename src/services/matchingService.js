const Job = require('../models/Job');
const Match = require('../models/Match');
const ParsedResume = require('../models/ParsedResume');
const { computeMatchScore } = require('../utils/scoring');
const { emitToUser } = require('./socketService');

const MIN_SCORE_THRESHOLD = 40; // MVP cutoff, tune later

/**
 * Runs matching for a single resume against the cached jobs collection.
 * Creates/updates Match documents and emits socket notifications for new matches.
 */
async function runMatchingForResume(resume) {
  if (!resume) return [];

  const candidateJobs = await buildCandidateJobQuery(resume);

  const newMatches = [];

  for (const job of candidateJobs) {
    const score = computeMatchScore(resume, job);
    if (score < MIN_SCORE_THRESHOLD) continue;

    const existing = await Match.findOne({ userId: resume.userId, jobId: job._id });

    if (!existing) {
      const match = await Match.create({
        userId: resume.userId,
        jobId: job._id,
        score,
        matchedAt: new Date(),
        notified: false
      });
      newMatches.push(match);
    } else if (existing.score !== score) {
      existing.score = score;
      await existing.save();
    }
  }

  await notifyNewMatches(resume.userId, newMatches);
  return newMatches;
}

/**
 * Narrows down candidate jobs using title/country as a coarse Mongo filter
 * before applying finer-grained scoring in-memory.
 */
async function buildCandidateJobQuery(resume) {
  const titleRegexes = (resume.desiredTitles || []).map(
    (t) => new RegExp(t.split(/\s+/).join('|'), 'i')
  );

  const filter = { $or: [] };

  if (titleRegexes.length) {
    filter.$or.push({ job_title: { $in: titleRegexes } });
  }
  if (resume.preferredCountry) {
    filter.$or.push({ country: new RegExp(`^${resume.preferredCountry}$`, 'i') });
  }
  if (filter.$or.length === 0) {
    // No signal to filter on — limit to most recent jobs to avoid scanning everything
    return Job.find().sort({ fetched_at: -1 }).limit(200);
  }

  return Job.find(filter).sort({ fetched_at: -1 }).limit(500);
}

/**
 * Emits a socket.io event per new match and marks it notified.
 */
async function notifyNewMatches(userId, matches) {
  for (const match of matches) {
    const job = await Job.findById(match.jobId);
    emitToUser(userId.toString(), 'new_match', {
      matchId: match._id,
      jobId: job?._id,
      jobTitle: job?.job_title,
      employer: job?.employer_name,
      score: match.score
    });
    match.notified = true;
    await match.save();
  }
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