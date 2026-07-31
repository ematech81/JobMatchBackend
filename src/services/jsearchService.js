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

  const response = await axios.get(`${jsearch.baseUrl}/search`, {
    headers: {
      'X-RapidAPI-Key': jsearch.apiKey,
      'X-RapidAPI-Host': jsearch.apiHost
    },
    params: {
      query,
      country,
      page,
      num_pages: 1,
      language: 'en'
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
 * Cache-first country search (Section 3.3): reads the Job cache first;
 * only falls back to a live JSearch call (and caches the result) on a
 * cache miss, to conserve the JSearch quota.
 */
async function searchJobsByCountry(rawCountry, { page = 1, limit = 20, query = 'jobs' } = {}) {
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
    .sort({ fetched_at: -1 })
    .limit(limit);

  if (cached.length > 0) {
    return { source: 'cache', jobs: cached };
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

    const stale = await Job.find({ country: countryCode }).sort({ fetched_at: -1 }).limit(limit);
    if (stale.length) return { source: 'stale-cache', jobs: stale };

    throw err;
  }

  // Report the true origin so callers can't mistake fixture data for live data.
  return {
    source: jsearch.dataSource === 'fixture' ? 'fixture' : 'live',
    jobs: jobs.slice(0, limit)
  };
}

module.exports = {
  mapJSearchResultToJob,
  searchJobsLive,
  cacheJobs,
  searchJobsByCountry
};
