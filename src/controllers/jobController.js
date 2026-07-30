const asyncHandler = require('../utils/asyncHandler');
const { searchJobsByCountry } = require('../services/jsearchService');
const User = require('../models/User');
const Job = require('../models/Job');

/**
 * GET /api/jobs/search?country=Nigeria&page=1
 * Cache-first country search, independent of resume matching.
 */
exports.searchByCountry = asyncHandler(async (req, res) => {
  const { country, page = 1, limit = 20 } = req.query;

  if (!country) {
    return res.status(400).json({ message: 'country query param is required' });
  }

  const { source, jobs } = await searchJobsByCountry(country, {
    page: Number(page),
    limit: Number(limit)
  });

  res.json({ source, count: jobs.length, jobs });
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