const asyncHandler = require('../utils/asyncHandler');
const { searchJobsByCountry, searchAllCountries } = require('../services/jsearchService');
const User = require('../models/User');
const Job = require('../models/Job');

/**
 * GET /api/jobs/search?country=Nigeria&page=1
 * Cache-first country search, independent of resume matching. `country` is
 * optional — omitting it browses whatever's cached across every country
 * (see searchAllCountries) rather than erroring.
 */
exports.searchByCountry = asyncHandler(async (req, res) => {
  const { country, page = 1, limit = 20, jobType, datePosted } = req.query;

  // Express parses a single `?jobType=X` as a string and repeats
  // (`?jobType=X&jobType=Y`) as an array — normalize to always-array.
  const jobTypes = jobType ? (Array.isArray(jobType) ? jobType : [jobType]) : [];
  const filters = { jobTypes, datePosted };

  const { source, jobs } = country
    ? await searchJobsByCountry(country, { page: Number(page), limit: Number(limit), filters })
    : await searchAllCountries({ limit: Number(limit), filters });

  res.json({ source, count: jobs.length, jobs });
});

/**
 * GET /api/jobs/stats — public, deliberately. Aggregate counts only, no
 * listings, so it doesn't reopen the "Find Jobs shows real data to anyone"
 * hole that requireResume/requireActiveSubscription exist to close — a
 * total count can't be turned back into the underlying job data. Used by
 * the homepage's live-stats section instead of a made-up number.
 */
exports.getPublicStats = asyncHandler(async (req, res) => {
  const [totalJobs, countries] = await Promise.all([Job.countDocuments(), Job.distinct('country')]);
  const countryCount = countries.filter(Boolean).length;
  res.json({ totalJobs, countryCount });
});

exports.saveJob = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  await User.findByIdAndUpdate(req.user.id, { $addToSet: { savedJobs: job._id } });
  res.json({ message: 'Job saved', jobId: job._id });
});

exports.getSavedJobs = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('savedJobs');
  res.json({ jobs: user?.savedJobs || [] });
});

exports.unsaveJob = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });

  await User.findByIdAndUpdate(req.user.id, { $pull: { savedJobs: job._id } });
  res.json({ message: 'Job removed' });
});




exports.getJobById = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json({ job });
});

exports.getSimilarJobs = asyncHandler(async (req, res) => {
  const job = await findJobByEitherId(req.params.jobId);
  if (!job) return res.json({ jobs: [] });

  const titleWords = (job.job_title || '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map(escapeRegex);

  const orConditions = [];
  if (titleWords.length) {
    orConditions.push({ job_title: new RegExp(titleWords.join('|'), 'i') });
  }
  if (job.country) {
    orConditions.push({ country: job.country });
  }
  if (!orConditions.length) return res.json({ jobs: [] });

  const jobs = await Job.find({
    job_id: { $ne: job.job_id },
    $or: orConditions
  })
    .sort({ fetched_at: -1 })
    .limit(4);

  res.json({ jobs });
});

/**
 * Jobs are addressable by either JSearch's external `job_id` or our Mongo
 * `_id`, so route params accept both. Only treat the param as an ObjectId
 * when it structurally is one — otherwise Mongoose throws a CastError.
 */
function findJobByEitherId(id = '') {
  const or = [{ job_id: id }];
  if (/^[0-9a-fA-F]{24}$/.test(id)) or.push({ _id: id });
  return Job.findOne({ $or: or });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}