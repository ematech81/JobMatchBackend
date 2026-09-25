const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const ParsedResume = require('../models/ParsedResume');
const Match = require('../models/Match');
const GeneratedApplication = require('../models/GeneratedApplication');
const Job = require('../models/Job');
const { jsearch } = require('../config/env');

/**
 * Overview numbers for the dashboard's landing page. Revenue is reported as
 * two separate figures (trial vs monthly), never blended into one total —
 * trial's ₦5,000 is a one-time charge and monthly's ₦10,000 recurs, so a
 * single summed number would misrepresent actual recurring revenue.
 */
exports.getStats = asyncHandler(async (req, res) => {
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsers7d,
    newUsers30d,
    subsByStatus,
    subsByPlan,
    revenueByPlan,
    totalMatches,
    totalGeneratedApplications
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: cutoff7d } }),
    User.countDocuments({ createdAt: { $gte: cutoff30d } }),
    Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Subscription.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
    Subscription.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$plan', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Match.countDocuments(),
    GeneratedApplication.countDocuments()
  ]);

  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));

  res.json({
    users: { total: totalUsers, new7d: newUsers7d, new30d: newUsers30d },
    subscriptions: {
      byStatus: toMap(subsByStatus),
      byPlan: toMap(subsByPlan)
    },
    revenue: {
      trial: { total: revenueByPlan.find((r) => r._id === 'trial')?.total || 0, count: revenueByPlan.find((r) => r._id === 'trial')?.count || 0, oneTime: true },
      monthly: { total: revenueByPlan.find((r) => r._id === 'monthly')?.total || 0, count: revenueByPlan.find((r) => r._id === 'monthly')?.count || 0, recurring: true }
    },
    matches: { total: totalMatches },
    generatedApplications: { total: totalGeneratedApplications }
  });
});

/**
 * Paginated, searchable user list, with each row's subscription status
 * merged in via a single batched lookup rather than a query per user.
 */
exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  if (req.query.search) {
    const re = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: re }, { fullName: re }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('email fullName createdAt emailVerified resumeSource role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  const subs = await Subscription.find({ userId: { $in: users.map((u) => u._id) } })
    .select('userId plan status')
    .lean();
  const subByUserId = new Map(subs.map((s) => [String(s.userId), s]));

  const items = users.map((u) => ({
    ...u,
    subscription: subByUserId.get(String(u._id)) || null
  }));

  res.json(paginatedResponse(items, total, { page, limit }));
});

/**
 * Single-user deep dive — same multi-collection shape authController's
 * exportMyData/getMe already use for "my own data", parameterized by an
 * arbitrary user id instead of req.user.id.
 */
exports.getUserDetail = asyncHandler(async (req, res) => {
  const [user, subscription, resume, matches] = await Promise.all([
    User.findById(req.params.id).select('-passwordHash').lean(),
    Subscription.findOne({ userId: req.params.id }).lean(),
    ParsedResume.findOne({ userId: req.params.id }).lean(),
    Match.find({ userId: req.params.id })
      .sort({ matchedAt: -1 })
      .limit(10)
      .populate('jobId', 'job_title employer_name')
      .lean()
  ]);

  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({
    user,
    subscription: subscription || null,
    resume: resume || null,
    recentMatches: matches.map((m) => ({
      jobTitle: m.jobId?.job_title,
      employer: m.jobId?.employer_name,
      score: m.score,
      matchedAt: m.matchedAt
    }))
  });
});

exports.listSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.plan) filter.plan = req.query.plan;

  const [items, total] = await Promise.all([
    Subscription.find(filter)
      .populate('userId', 'email fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Subscription.countDocuments(filter)
  ]);

  res.json(paginatedResponse(items, total, { page, limit }));
});

/**
 * Per-country job cache health — count, oldest/newest fetch, live/fixture
 * split, and a freshness flag against the same TTL threshold
 * ensureFreshJobsForCountry/searchJobsByCountry already use. This is the
 * exact visibility that was missing during the JSearch quota incident: the
 * cache was 28 days stale with zero signal anywhere in the app surfacing it.
 */
exports.getJobCacheHealth = asyncHandler(async (req, res) => {
  const rows = await Job.aggregate([
    {
      $group: {
        _id: '$country',
        count: { $sum: 1 },
        oldest: { $min: '$fetched_at' },
        newest: { $max: '$fetched_at' },
        live: { $sum: { $cond: [{ $eq: ['$source', 'live'] }, 1, 0] } },
        fixture: { $sum: { $cond: [{ $eq: ['$source', 'fixture'] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const freshCutoffMs = jsearch.cacheTtlHours * 60 * 60 * 1000;

  const countries = rows.map((r) => ({
    country: r._id,
    count: r.count,
    oldest: r.oldest,
    newest: r.newest,
    liveCount: r.live,
    fixtureCount: r.fixture,
    fresh: Date.now() - new Date(r.newest).getTime() <= freshCutoffMs
  }));

  res.json({ cacheTtlHours: jsearch.cacheTtlHours, countries });
});
