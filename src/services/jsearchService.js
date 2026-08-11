const axios = require('axios');
const { jsearch } = require('../config/env');
const Job = require('../models/Job');
const { normalizeCountryToCode } = require('../utils/countryCodes');
const { fixtureJobSearch } = require('./fixtureJobsService');

function mapJSearchResultToJob(raw) {
  return {
    job_id: raw.job_id,
    job_title: raw.job_title,
    employer_name: raw.employer_name,
    employer_logo: raw.employer_logo,
    employer_website: raw.employer_website,
    country: raw.job_country || raw.employer_country,
    job_city: raw.job_city,
    job_state: raw.job_state,
    job_employment_type: raw.job_employment_type,
    job_is_remote: raw.job_is_remote,
    apply_link: raw.job_apply_link,
    job_publisher: raw.job_publisher,
    job_description: raw.job_description,
    job_highlights: raw.job_highlights,
    job_min_salary: raw.job_min_salary,
    job_max_salary: raw.job_max_salary,
    job_salary_currency: raw.job_salary_currency,
    job_salary_period: raw.job_salary_period,
    job_posted_at: raw.job_posted_at_datetime_utc
      ? new Date(raw.job_posted_at_datetime_utc)
      : null,
    fetched_at: new Date(),
    rawPayload: raw
  };
}

/**
 * Fetches raw JSearch-shaped jobs. This is the single network boundary for
 * job data: when jsearch.dataSource is 'fixture' it serves the recorded
 * responses in src/jobDummyData/ instead of calling the API, so every
 * downstream path (mapping, caching, matching, notifications) runs
 * identically in both modes.
 *
 * In live mode this counts against the JSearch quota (Section 2.1), so only
 * call it from cache-miss paths and the cron pull.
 */
async function searchJobsLive({ query, country, page = 1 }) {
  if (jsearch.dataSource === 'fixture') {
    return fixtureJobSearch({ query, country });
  }

  // /search (v1) 404s on this account's actual subscription — confirmed
  // against a real request that /search-v2 is the live endpoint. It also
  // uses cursor-based pagination rather than a page number (the response
  // carries data.cursor for the next page), so `page` isn't sent — this
  // call only ever fetches once per cache miss regardless; repeat "page 2"
  // views are served from the Job cache, not a second live call.
  const response = await axios.get(`${jsearch.baseUrl}/search-v2`, {
    headers: {
      'X-RapidAPI-Key': jsearch.apiKey,
      'X-RapidAPI-Host': jsearch.apiHost
    },
    params: {
      query,
      country,
      num_pages: 1,
      date_posted: 'all'
    },
    timeout: 15000
  });

  return response.data?.data?.jobs || [];
}

/**
 * Maps raw JSearch jobs into the canonical Job shape and upserts them,
 * deduped by job_id (Section 3.2). Returns the persisted documents.
 */
async function cacheJobs(rawJobs = []) {
  const ops = rawJobs
    .filter((raw) => raw.job_id)
    .map((raw) => ({
      updateOne: {
        filter: { job_id: raw.job_id },
        update: { $set: mapJSearchResultToJob(raw) },
        upsert: true
      }
    }));

  if (!ops.length) return [];

  await Job.bulkWrite(ops, { ordered: false });

  const jobIds = ops.map((op) => op.updateOne.filter.job_id);
  return Job.find({ job_id: { $in: jobIds } }).sort({ fetched_at: -1 });
}

/**
 * "Contract" in the filter UI needs to match the fixture/JSearch spelling
 * "Contractor" — everything else is an exact, case-sensitive match against
 * the stored value.
 */
function matchesEmploymentType(job, uiType) {
  const type = (job.job_employment_type || '').toLowerCase();
  if (uiType === 'Contract') return type.includes('contract');
  return type === uiType.toLowerCase();
}

const DATE_POSTED_DAYS = {
  'Last 24 hours': 1,
  'Last 7 days': 7,
  'Last 30 days': 30
};

/**
 * Applied uniformly wherever the job list is finalized, regardless of
 * whether it came from cache or a live fetch — so filtering behaves the
 * same no matter which path served the request.
 *
 * Filters in JS rather than as a Mongo query: fine at the current fixture
 * scale (10 jobs/country), but a real deployment with large cached sets per
 * country would need this pushed into the Job.find() query instead.
 */
function applyFilters(jobs, { jobTypes = [], datePosted } = {}) {
  let filtered = jobs;

  if (jobTypes.length) {
    filtered = filtered.filter((job) =>
      jobTypes.some((t) => (t === 'Remote' ? job.job_is_remote : matchesEmploymentType(job, t)))
    );
  }

  const days = DATE_POSTED_DAYS[datePosted];
  if (days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    filtered = filtered.filter(
      (job) => job.job_posted_at && new Date(job.job_posted_at).getTime() >= cutoff
    );
  }

  return filtered;
}

/**
 * Cache-first country search (Section 3.3): reads the Job cache first;
 * only falls back to a live JSearch call (and caches the result) on a
 * cache miss, to conserve the JSearch quota.
 *
 * Filters are applied after deciding cache-hit vs cache-miss, not as part of
 * that decision — an empty *filtered* result (e.g. no remote jobs cached for
 * this country) must return zero jobs, not be mistaken for "nothing cached"
 * and trigger an unnecessary (and filter-ignorant) live fetch.
 */
async function searchJobsByCountry(rawCountry, { page = 1, limit = 20, query = 'jobs', filters = {} } = {}) {
  const countryCode = normalizeCountryToCode(rawCountry);
  if (!countryCode) {
    const err = new Error(`Unrecognized country: "${rawCountry}"`);
    err.statusCode = 400;
    throw err;
  }

  // Only serve cache entries newer than the TTL — without this check a single
  // stale/thin result set would be served indefinitely (Section 3.2's
  // fetched_at exists precisely so the cache can expire).
  const freshCutoff = new Date(Date.now() - jsearch.cacheTtlHours * 60 * 60 * 1000);

  const cached = await Job.find({ country: countryCode, fetched_at: { $gte: freshCutoff } })
    .sort({ fetched_at: -1 });

  if (cached.length > 0) {
    return { source: 'cache', jobs: applyFilters(cached, filters).slice(0, limit) };
  }

  // JSearch requires a non-empty `query`; 'jobs' is a placeholder for a
  // country-only browse and is ignored as a keyword in fixture mode.
  let jobs;
  try {
    const rawJobs = await searchJobsLive({ query, country: countryCode, page });
    jobs = await cacheJobs(rawJobs);
  } catch (err) {
    // Upstream failed (quota exhausted, network, outage). Stale results beat
    // no results, so fall back to expired cache entries if we have any.
    console.error(`[JSearch] Refetch failed for ${countryCode}:`, err.message);

    const stale = await Job.find({ country: countryCode }).sort({ fetched_at: -1 });
    if (stale.length) return { source: 'stale-cache', jobs: applyFilters(stale, filters).slice(0, limit) };

    throw err;
  }

  // Report the true origin so callers can't mistake fixture data for live data.
  return {
    source: jsearch.dataSource === 'fixture' ? 'fixture' : 'live',
    jobs: applyFilters(jobs, filters).slice(0, limit)
  };
}

module.exports = {
  mapJSearchResultToJob,
  searchJobsLive,
  cacheJobs,
  searchJobsByCountry
};
