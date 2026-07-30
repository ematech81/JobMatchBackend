const asyncHandler = require('../utils/asyncHandler');
const { searchJobsByCountry } = require('../services/jsearchService');
const User = require('../models/User');

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
  const { jobId } = req.params;
  await User.findByIdAndUpdate(req.user.id, { $addToSet: { savedJobs: jobId } });
  res.json({ message: 'Job saved' });
});

exports.getSavedJobs = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('savedJobs');
  res.json({ jobs: user?.savedJobs || [] });
});




exports.getJobById = asyncHandler(async (req, res) => {
  const { jobId } = req.params;

  const job = await Job.findOne({
    $or: [{ job_id: jobId }, { _id: jobId.match(/^[0-9a-fA-F]{24}$/) ? jobId : null }]
  });

  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json({ job });
});

exports.getSimilarJobs = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const job = await Job.findOne({ job_id: jobId });
  if (!job) return res.json({ jobs: [] });

  const titleWords = (job.job_title || '').split(/\s+/).filter((w) => w.length > 3);
  const regex = new RegExp(titleWords.join('|'), 'i');

  const jobs = await Job.find({
    job_id: { $ne: job.job_id },
    $or: [{ job_title: regex }, { country: job.country }]
  })
    .sort({ fetched_at: -1 })
    .limit(4);

  res.json({ jobs });
});